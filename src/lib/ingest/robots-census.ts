import { and, eq, sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import type { Job } from "./common";
import { ROBOTS_TOKENS } from "@/lib/robots/tokens";

export { ROBOTS_TOKENS };

export const ROBOTS_CENSUS = {
  site: "https://commoncrawl.org",
  index: "https://index.commoncrawl.org/collinfo.json",
} as const;


interface CrawlRecord {
  id: string;
  /** YYYY-MM-DD, first day of the crawl */
  date: string;
  files: number;
  sites: number;
  tokens: Record<string, { mentioned: number; blocked: number }>;
}

/**
 * Receives one robots.txt census per Common Crawl crawl from the Actions worker
 * (scripts/robots-census.mjs) and answers which crawls are already stored (GET).
 * Stored as external_series rows: source cc-robots, series `<token>:blocked`,
 * `<token>:mentioned`, `_sites`, `_files`; period = crawl start date.
 */
export const robotsCensusJob: Job = async (ctx) => {
  if (!ctx.payload) {
    const rows = await ctx.db
      .select({ period: externalSeries.period, value: externalSeries.value })
      .from(externalSeries)
      .where(and(eq(externalSeries.source, "cc-robots"), eq(externalSeries.series, "_sites")));
    return { stats: { done: rows.map((r) => r.period).sort() } };
  }
  let body: { crawls?: CrawlRecord[] };
  try {
    body = JSON.parse(ctx.payload) as { crawls?: CrawlRecord[] };
  } catch {
    throw new Error("body is not JSON");
  }
  const crawls = (body.crawls ?? []).filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.sites > 0 && c.tokens);
  const rows: Array<{ source: string; series: string; period: string; value: number; lo: null; hi: null }> = [];
  for (const c of crawls) {
    rows.push({ source: "cc-robots", series: "_sites", period: c.date, value: c.sites, lo: null, hi: null });
    rows.push({ source: "cc-robots", series: "_files", period: c.date, value: c.files, lo: null, hi: null });
    for (const [token, t] of Object.entries(c.tokens)) {
      if (!(ROBOTS_TOKENS as readonly string[]).includes(token)) continue;
      rows.push({ source: "cc-robots", series: `${token}:mentioned`, period: c.date, value: t.mentioned, lo: null, hi: null });
      rows.push({ source: "cc-robots", series: `${token}:blocked`, period: c.date, value: t.blocked, lo: null, hi: null });
    }
  }
  for (let i = 0; i < rows.length; i += 300) {
    await ctx.db
      .insert(externalSeries)
      .values(rows.slice(i, i + 300))
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }
  return { stats: { crawls: crawls.map((c) => c.id), rows: rows.length }, cursor: crawls.map((c) => c.date).sort().at(-1) ?? null };
};
