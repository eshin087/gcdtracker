import { sql } from "drizzle-orm";
import { fetchJson, type Job, timeLeft } from "./common";
import { readCollectorState, commitCollectorState } from "./state";
import { seriesWrites, type SeriesRow } from "./series-write";
export interface RadarMetadata extends Record<string, unknown> {
  normalization: string;
  units: Array<{ name: string; value: string }>;
  dateRange: Array<{ startTime: string; endTime: string }>;
  lastUpdated: string | null;
  fetchedAt: string;
  version: 2;
}
interface RadarResponse {
  success?: boolean;
  result?: { summary_0?: Record<string, string>; serie_0?: Record<string, unknown>; meta?: Partial<RadarMetadata> };
}
const BASE = "https://api.cloudflare.com/client/v4/radar";
export const RADAR_SOURCE = "radar-v2";
export const RADAR_GROUPS = ["bot-share", "crawl-refer", "operator"] as const;
export function parseRadar(group: string, body: RadarResponse, now = new Date()): { rows: SeriesRow[]; metadata: RadarMetadata } {
  const result = body.result, meta = result?.meta;
  if (body.success !== true || !meta?.normalization || !Array.isArray(meta.dateRange) || !meta.dateRange.length ||
    !meta.dateRange.every((r) => Number.isFinite(Date.parse(r.startTime)) && Number.isFinite(Date.parse(r.endTime)))) {
    throw new Error("Radar response missing verified units/window metadata");
  }
  const metadata: RadarMetadata = {
    normalization: meta.normalization, units: Array.isArray(meta.units) ? meta.units : [],
    dateRange: meta.dateRange, lastUpdated: meta.lastUpdated ?? null, fetchedAt: now.toISOString(), version: 2,
  };
  const rows: SeriesRow[] = [];
  if (group === "operator") {
    const serie = result?.serie_0, timestamps = serie?.timestamps;
    if (!Array.isArray(timestamps)) throw new Error("Radar timeseries missing timestamps");
    for (const [operator, values] of Object.entries(serie!)) {
      if (operator === "timestamps") continue;
      if (!Array.isArray(values) || values.length !== timestamps.length) throw new Error("Radar series length mismatch");
      values.forEach((value, i) => {
        if (value === null || value === "" || !Number.isFinite(Number(value)) || !Number.isFinite(Date.parse(timestamps[i]))) throw new Error("Radar invalid point");
        rows.push({ source: RADAR_SOURCE, series: "operator:" + operator, period: String(timestamps[i]).slice(0, 10), value: Number(value) });
      });
    }
  } else {
    if (!result?.summary_0 || typeof result.summary_0 !== "object") throw new Error("Radar summary missing");
    for (const [name, value] of Object.entries(result.summary_0)) {
      if (value === null || value === "" || !Number.isFinite(Number(value))) throw new Error("Radar invalid summary");
      rows.push({ source: RADAR_SOURCE, series: group + ":" + name, period: metadata.dateRange[0].endTime.slice(0, 10), value: Number(value) });
    }
  }
  return { rows, metadata };
}
/** Whole snapshots retain a common normalization basis. Never splice rolling normalized windows. */
export const radarJob: Job = async (ctx) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { outcome: "disabled", stats: { skipped: "Radar token not configured" } };
  const endpoints = [
    ["bot-share", "/bots/summary/bot?dateRange=7d&limitPerGroup=15"],
    ["crawl-refer", "/bots/crawlers/summary/CRAWL_REFER_RATIO?dateRange=7d"],
    ["operator", "/bots/timeseries_groups/bot_operator?dateRange=28d&aggInterval=1d&limitPerGroup=8"],
  ] as const;
  const failed: string[] = [];
  let rows = 0, partial = false;
  for (const [group, endpoint] of endpoints) {
    if (timeLeft(ctx) < 5_000) { partial = true; break; }
    try {
      const key = "radar:" + group;
      const snapshot = await readCollectorState<Record<string, unknown>>(ctx.db, key, {});
      // Daily source snapshots need no half-hourly refetch.
      if (typeof snapshot.state.fetchedAt === "string" && Date.now() - Date.parse(snapshot.state.fetchedAt) < 86_400_000) continue;
      const res = await fetchJson<RadarResponse>(BASE + endpoint, { headers: { authorization: "Bearer " + token } }, Math.min(20_000, timeLeft(ctx) - 2_000));
      if (res.status !== 200 || !res.body) throw new Error("HTTP " + res.status);
      const parsed = parseRadar(group, res.body);
      const committed = await commitCollectorState(ctx.db, key, snapshot, parsed.metadata, (guard) => [
        sql`delete from external_series where source = ${RADAR_SOURCE} and series like ${group + ":%"} and ${guard}`,
        ...seriesWrites(parsed.rows, guard),
      ]);
      if (committed) rows += parsed.rows.length;
      else partial = true;
    } catch (err) { failed.push(group + ": " + (err instanceof Error ? err.message : "fetch failed")); }
  }
  return { stats: { rows, failed }, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
