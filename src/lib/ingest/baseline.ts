import { sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job, lastCursor, OUTBOUND_HEADERS, sleep, timeLeft } from "./common";

/**
 * Long series that predate AI, for the before-and-after page:
 *  - Wikimedia pageviews per month by agent type (user / spider / automated), since July 2015
 *  - Stack Overflow questions asked per month, since 2012
 *  - StatCounter search-engine market share per month, since 2009 (quoted)
 * Everything lands in external_series. First run backfills; later runs top up recent months.
 */
export const BASELINE = {
  wikimedia: "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate",
  stackexchange: "https://api.stackexchange.com/2.3/questions",
  statcounter: "https://gs.statcounter.com/search-engine-market-share/all/worldwide/chart.php",
} as const;

const WM_PROJECTS = ["all-projects", "en.wikipedia"] as const;
const WM_AGENTS = ["user", "spider", "automated"] as const;
const SO_FROM = "2012-01";

type Row = { source: string; series: string; period: string; value: number; lo: null; hi: null };

async function upsert(ctx: Parameters<Job>[0], rows: Row[]) {
  for (let i = 0; i < rows.length; i += 300) {
    await ctx.db
      .insert(externalSeries)
      .values(rows.slice(i, i + 300))
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }
}

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export const baselineJob: Job = async (ctx) => {
  const done = await lastCursor(ctx.db, "baseline");
  const backfill = !done;
  const stats: Record<string, unknown> = { backfill };
  const now = new Date();
  // The current month is incomplete everywhere; the newest full month is the target.
  const lastFull = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);
  const lastFullMonth = lastFull.toISOString().slice(0, 7);

  // 1. Wikimedia pageviews by agent, monthly. One call per project per agent, whole history.
  let wmRows = 0;
  for (const project of WM_PROJECTS) {
    for (const agent of WM_AGENTS) {
      if (timeLeft(ctx) < 15_000) break;
      const start = backfill ? "2015070100" : `${now.getUTCFullYear() - 1}${String(now.getUTCMonth() + 1).padStart(2, "0")}0100`;
      const end = `${lastFullMonth.replace("-", "")}0100`;
      const { status, body } = await fetchJson<{ items?: Array<{ timestamp: string; views: number }> }>(`${BASELINE.wikimedia}/${project}/all-access/${agent}/monthly/${start}/${end}`);
      if (status !== 200 || !body?.items) {
        stats[`wm:${project}:${agent}`] = `skipped (${status})`;
        continue;
      }
      const rows: Row[] = body.items.map((it) => ({ source: "wm-pageviews", series: `${project}:${agent}`, period: `${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}`, value: it.views, lo: null, hi: null }));
      await upsert(ctx, rows);
      wmRows += rows.length;
    }
  }
  stats.wmRows = wmRows;

  // 2. Stack Overflow questions per month. Keyless quota is 300 calls a day, so backfill in slices.
  const soDone = await ctx.db
    .select({ period: externalSeries.period })
    .from(externalSeries)
    .where(sql`${externalSeries.source} = 'stackoverflow' and ${externalSeries.series} = 'questions'`);
  const have = new Set(soDone.map((r) => r.period));
  const all = monthsBetween(SO_FROM, lastFullMonth);
  const wanted = all.filter((m) => !have.has(m));
  // Always refresh the newest two full months (counts settle as questions are deleted).
  const refresh = all.slice(-2);
  const months = [...new Set([...refresh, ...wanted])].sort().reverse().slice(0, 120);
  let soRows = 0;
  let soStatus = "ok";
  for (const m of months) {
    if (timeLeft(ctx) < 12_000) {
      soStatus = "partial";
      break;
    }
    const from = Math.floor(Date.parse(`${m}-01T00:00:00Z`) / 1000);
    const d = new Date(`${m}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const to = Math.floor(d.getTime() / 1000);
    const { status, body } = await fetchJson<{ total?: number; error_id?: number; backoff?: number }>(`${BASELINE.stackexchange}?site=stackoverflow&fromdate=${from}&todate=${to}&filter=total`, { headers: { ...OUTBOUND_HEADERS, "accept-encoding": "gzip" } });
    if (status !== 200 || typeof body?.total !== "number") {
      soStatus = `stopped at ${m} (${status}${body?.error_id ? ` error ${body.error_id}` : ""})`;
      break;
    }
    await upsert(ctx, [{ source: "stackoverflow", series: "questions", period: m, value: body.total, lo: null, hi: null }]);
    soRows++;
    await sleep(body.backoff ? body.backoff * 1000 : 150);
  }
  stats.soRows = soRows;
  stats.so = soStatus;
  stats.soMissing = Math.max(0, wanted.length - soRows);

  // 3. StatCounter search-engine share, monthly CSV (quoted; Google, Bing, and the rest).
  if (timeLeft(ctx) > 10_000) {
    try {
      const res = await fetch(`${BASELINE.statcounter}?device=desktop&device_hidden=desktop&statType_hidden=search_engine&region_hidden=ww&granularity=monthly&fromMonthYear=2009-01&toMonthYear=${lastFullMonth}&csv=1&multi-device=true`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; gcdTracker/0.4; +https://gcdtracker.vercel.app)" },
        cache: "no-store",
      });
      const text = res.ok ? await res.text() : "";
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0]?.split(",").map((h) => h.replace(/"/g, "").trim()) ?? [];
      const rows: Row[] = [];
      if (header[0]?.toLowerCase() === "date") {
        for (const line of lines.slice(1)) {
          const cells = line.split(",").map((c) => c.replace(/"/g, "").trim());
          const period = cells[0];
          if (!/^\d{4}-\d{2}$/.test(period)) continue;
          header.slice(1).forEach((engine, i) => {
            const v = Number(cells[i + 1]);
            if (Number.isFinite(v)) rows.push({ source: "statcounter", series: engine.toLowerCase(), period, value: v, lo: null, hi: null });
          });
        }
      }
      await upsert(ctx, rows);
      stats.statcounterRows = rows.length;
      if (rows.length === 0) stats.statcounter = `no monthly rows (${res.status}, header: ${header.slice(0, 3).join("|")})`;
    } catch (err) {
      stats.statcounter = `failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return { stats, cursor: lastFullMonth, partial: soStatus !== "ok" };
};
