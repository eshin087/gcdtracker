import { sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job } from "./common";

const BASE = "https://api.cloudflare.com/client/v4/radar";

interface Summary {
  success?: boolean;
  result?: { summary_0?: Record<string, string>; meta?: { dateRange?: Array<{ startTime: string; endTime: string }> } };
  errors?: Array<{ message: string }>;
}
interface Timeseries {
  success?: boolean;
  result?: { serie_0?: Record<string, string[] | string> & { timestamps?: string[] }; meta?: unknown };
}

/**
 * Cloudflare Radar bot insights (CC BY-NC 4.0). Runs only when CLOUDFLARE_API_TOKEN
 * (Account → Radar → Read) is configured.
 */
export const radarJob: Job = async (ctx) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { stats: { skipped: "CLOUDFLARE_API_TOKEN not set" } };
  const headers = { authorization: `Bearer ${token}` };
  const stats: Record<string, unknown> = {};
  const today = new Date().toISOString().slice(0, 10);
  const rows: Array<{ source: string; series: string; period: string; value: number; lo: number | null; hi: number | null }> = [];

  // Share of bot traffic by bot, last 7 days.
  const s1 = await fetchJson<Summary>(`${BASE}/bots/summary/bot?dateRange=7d&limitPerGroup=15`, { headers });
  if (s1.status === 200 && s1.body?.result?.summary_0) {
    for (const [bot, v] of Object.entries(s1.body.result.summary_0)) rows.push({ source: "radar", series: `bot-share:${bot}`, period: today, value: Number(v), lo: null, hi: null });
    stats.botShare = Object.keys(s1.body.result.summary_0).length;
  } else stats.botShare = `${s1.status} ${s1.body?.errors?.[0]?.message ?? ""}`.trim();

  // Crawl-to-refer ratio by AI platform.
  const s2 = await fetchJson<Summary>(`${BASE}/bots/crawlers/summary/CRAWL_REFER_RATIO?dateRange=7d`, { headers });
  if (s2.status === 200 && s2.body?.result?.summary_0) {
    for (const [k, v] of Object.entries(s2.body.result.summary_0)) rows.push({ source: "radar", series: `crawl-refer:${k}`, period: today, value: Number(v), lo: null, hi: null });
    stats.crawlRefer = Object.keys(s2.body.result.summary_0).length;
  } else stats.crawlRefer = `${s2.status}`;

  // Daily timeseries by bot operator (28 days).
  const t = await fetchJson<Timeseries>(`${BASE}/bots/timeseries_groups/bot_operator?dateRange=28d&aggInterval=1d&limitPerGroup=8`, { headers });
  if (t.status === 200 && t.body?.result?.serie_0?.timestamps) {
    const serie = t.body.result.serie_0;
    const stamps = serie.timestamps as string[];
    for (const [op, vals] of Object.entries(serie)) {
      if (op === "timestamps" || !Array.isArray(vals)) continue;
      vals.forEach((v, i) => {
        if (stamps[i]) rows.push({ source: "radar", series: `operator:${op}`, period: stamps[i].slice(0, 10), value: Number(v), lo: null, hi: null });
      });
    }
    stats.operators = Object.keys(serie).length - 1;
  } else stats.operators = `${t.status}`;

  for (let i = 0; i < rows.length; i += 200) {
    await ctx.db
      .insert(externalSeries)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }
  stats.rows = rows.length;
  return { stats };
};
