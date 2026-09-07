import { sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job, type JobContext, OUTBOUND_HEADERS, timeLeft } from "./common";
import { readCollectorState, commitSeries, type SeriesRow } from "./series-write";
import { commitCollectorState } from "./state";
import { isUtcDay } from "./windows";

/** Monthly context series; source checkpoints and rotation make bounded runs resumable. */
export const BASELINE = {
  wikimedia: "https://wikimedia.org/api/rest_v1/metrics/pageviews/aggregate",
  stackexchange: "https://api.stackexchange.com/2.3/questions",
  statcounter: "https://gs.statcounter.com/search-engine-market-share/all/worldwide/chart.php",
} as const;
const WM = ["all-projects", "en.wikipedia"].flatMap((project) => ["user", "spider", "automated"].map((agent) => ({ project, agent })));
const validMonth = (month: string) => isUtcDay(month + "-01");
export function monthsBetween(from: string, to: string): string[] {
  if (!validMonth(from) || !validMonth(to) || from > to) throw new Error("invalid month window");
  const out: string[] = [];
  const date = new Date(from + "-01T00:00:00Z");
  while (date.toISOString().slice(0, 7) <= to) {
    out.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return out;
}
export function wikimediaRows(series: string, items: Array<{ timestamp: string; views: number }>, start: string, end: string): SeriesRow[] {
  const rows = items.map((item) => {
    if (typeof item.timestamp !== "string" || !/^\d{10}$/.test(item.timestamp) || !Number.isSafeInteger(item.views) || item.views < 0) throw new Error("invalid Wikimedia month");
    const period = item.timestamp.slice(0, 4) + "-" + item.timestamp.slice(4, 6);
    if (!validMonth(period) || period < start || period > end) throw new Error("out-of-range Wikimedia month");
    return { source: "wm-pageviews", series, period, value: item.views };
  });
  if (!rows.some((row) => row.period === end)) throw new Error("Wikimedia latest full month missing; retaining checkpoint");
  return rows;
}

/** Minimal RFC4180 cell handling: quoted labels may contain commas or escaped quotes. */
function csvCells(line: string): string[] {
  const cells: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("unterminated StatCounter CSV field");
  cells.push(value.trim());
  return cells;
}
export function statcounterRows(text: string, end: string): SeriesRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const header = csvCells(lines.shift() ?? "");
  if (header[0]?.toLowerCase() !== "date" || header.length < 2 || header.slice(1).some((name) => !name)) throw new Error("invalid StatCounter CSV header");
  const rows: SeriesRow[] = [];
  for (const line of lines) {
    const cells = csvCells(line), period = cells[0];
    if (cells.length !== header.length || !validMonth(period) || period < "2009-01" || period > end) throw new Error("invalid StatCounter month");
    cells.slice(1).forEach((cell, i) => {
      const value = Number(cell);
      if (!cell || !Number.isFinite(value) || value < 0 || value > 100) throw new Error("invalid StatCounter percentage");
      rows.push({ source: "statcounter", series: header[i + 1].toLowerCase(), period, value });
    });
  }
  if (!rows.some((row) => row.period === end)) throw new Error("StatCounter latest full month missing; retaining checkpoint");
  return rows;
}
export function stackOverflowRange(month: string) {
  if (!validMonth(month)) throw new Error("invalid Stack Overflow month");
  const date = new Date(month + "-01T00:00:00Z"), from = date.getTime() / 1000;
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { from, to: date.getTime() / 1000 - 1 }; // API todate is inclusive.
}
export type StackOverflowProgress = { refreshedMonth: string; refreshRemaining: string[]; backoffUntil: string | null };
const INITIAL_SO: StackOverflowProgress = { refreshedMonth: "", refreshRemaining: [], backoffUntil: null };
export function stackOverflowBackoff(seconds: unknown, now: number): string | null {
  if (seconds === undefined) return null;
  if (!Number.isSafeInteger(seconds) || (seconds as number) < 0) throw new Error("invalid Stack Exchange backoff");
  return new Date(now + (seconds as number) * 1000).toISOString();
}
async function collectStackOverflow(ctx: JobContext, end: string): Promise<{ rows: number; partial: boolean; missing: number }> {
  const key = "baseline:stackoverflow";
  let snap = await readCollectorState(ctx.db, key, INITIAL_SO);
  const all = monthsBetween("2012-01", end);
  const done = await ctx.db.select({ period: externalSeries.period }).from(externalSeries)
    .where(sql`${externalSeries.source}='stackoverflow' and ${externalSeries.series}='questions'`);
  const have = new Set(done.map((row) => row.period));
  const missing = all.filter((month) => !have.has(month)).reverse();
  let refresh = snap.state.refreshedMonth === end ? [...snap.state.refreshRemaining] : all.slice(-2).reverse();
  let rows = 0;
  // Small slices leave budget for the other seven source units.
  for (let i = 0; i < 4 && timeLeft(ctx) >= 12_000; i++) {
    if (snap.state.backoffUntil && Date.parse(snap.state.backoffUntil) > Date.now()) break;
    const month = missing[0] ?? refresh[0];
    if (!month) break;
    const { from, to } = stackOverflowRange(month);
    const { status, body } = await fetchJson<{ total?: number; error_id?: number; backoff?: number }>(
      `${BASELINE.stackexchange}?site=stackoverflow&fromdate=${from}&todate=${to}&filter=total`,
      { headers: { ...OUTBOUND_HEADERS, "accept-encoding": "gzip" } }, Math.min(20_000, timeLeft(ctx) - 2_000));
    const backoffUntil = stackOverflowBackoff(body?.backoff, Date.now());
    if (status !== 200 || body?.error_id || !Number.isSafeInteger(body?.total) || body!.total! < 0) {
      // Rate-limit instructions also apply to unsuccessful API responses.
      if (backoffUntil) await commitCollectorState(ctx.db, key, snap, { ...snap.state, backoffUntil });
      throw new Error(`Stack Overflow ${month}: HTTP ${status}${body?.error_id ? " error " + body.error_id : ""}`);
    }
    refresh = refresh.filter((m) => m !== month);
    const next = { refreshedMonth: end, refreshRemaining: refresh, backoffUntil };
    if (!await commitSeries(ctx.db, key, snap, next, [{ source: "stackoverflow", series: "questions", period: month, value: body!.total! }])) return { rows, partial: true, missing: missing.length };
    if (missing[0] === month) missing.shift();
    rows++;
    snap = await readCollectorState(ctx.db, key, INITIAL_SO);
    if (backoffUntil) break;
  }
  return { rows, partial: missing.length > 0 || refresh.length > 0, missing: missing.length };
}

export const baselineJob: Job = async (ctx) => {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1).toISOString().slice(0, 7);
  const wheel = await readCollectorState(ctx.db, "baseline:rotation", { nextIndex: 0 });
  const failed: string[] = [];
  const stats: Record<string, unknown> = { wmRows: 0, soRows: 0, statcounterRows: 0 };
  let partial = false;
  for (let offset = 0; offset < 8; offset++) {
    if (timeLeft(ctx) < 12_000) { partial = true; break; }
    const index = (wheel.state.nextIndex + offset) % 8;
    try {
      if (index < WM.length) {
        const { project, agent } = WM[index], key = `baseline:wm:${project}:${agent}`;
        const progress = await readCollectorState(ctx.db, key, { initialized: false, refreshedMonth: "" });
        if (progress.state.refreshedMonth !== end) {
          const start = progress.state.initialized ? `${now.getUTCFullYear() - 1}-${String(now.getUTCMonth() + 1).padStart(2, "0")}` : "2015-07";
          const { status, body } = await fetchJson<{ items?: Array<{ timestamp: string; views: number }> }>(
            `${BASELINE.wikimedia}/${project}/all-access/${agent}/monthly/${start.replace("-", "")}0100/${end.replace("-", "")}0100`,
            {}, Math.min(20_000, timeLeft(ctx) - 2_000));
          if (status !== 200 || !Array.isArray(body?.items)) throw new Error(`Wikimedia ${project}:${agent}: HTTP ${status}`);
          const rows = wikimediaRows(`${project}:${agent}`, body.items, start, end);
          if (await commitSeries(ctx.db, key, progress, { initialized: true, refreshedMonth: end }, rows)) stats.wmRows = Number(stats.wmRows) + rows.length;
          else partial = true;
        }
      } else if (index === 6) {
        const result = await collectStackOverflow(ctx, end);
        stats.soRows = result.rows; stats.soMissing = result.missing; partial ||= result.partial;
      } else {
        const key = "baseline:statcounter";
        const progress = await readCollectorState(ctx.db, key, { refreshedMonth: "" });
        if (progress.state.refreshedMonth !== end) {
          const res = await fetch(`${BASELINE.statcounter}?device=desktop&device_hidden=desktop&statType_hidden=search_engine&region_hidden=ww&granularity=monthly&fromMonthYear=2009-01&toMonthYear=${end}&csv=1&multi-device=true`, {
            headers: { "user-agent": OUTBOUND_HEADERS["user-agent"] }, cache: "no-store",
            signal: AbortSignal.timeout(Math.min(20_000, timeLeft(ctx) - 2_000)),
          });
          if (!res.ok) throw new Error(`StatCounter HTTP ${res.status}`);
          const rows = statcounterRows(await res.text(), end);
          if (await commitSeries(ctx.db, key, progress, { refreshedMonth: end }, rows)) stats.statcounterRows = rows.length;
          else partial = true;
        }
      }
    } catch (err) {
      failed.push(err instanceof Error ? err.message : "baseline fetch failed");
    }
    // Advance after failed attempts too: a slow first source cannot starve the others.
    const rotation = await readCollectorState(ctx.db, "baseline:rotation", { nextIndex: 0 });
    await commitCollectorState(ctx.db, "baseline:rotation", rotation, { nextIndex: (index + 1) % 8 });
  }
  return { stats: { ...stats, failed }, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
