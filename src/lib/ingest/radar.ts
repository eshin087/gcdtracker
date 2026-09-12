import { sql } from "drizzle-orm";
import { fetchJson, OUTBOUND_HEADERS, type Job, timeLeft } from "./common";
import { readCollectorState, commitCollectorState } from "./state";
import { seriesWrites, type SeriesRow } from "./series-write";
import { publicRadarMetadata } from "../public-radar";

export interface RadarMetadata extends Record<string, unknown> {
  normalization: string;
  units: Array<{ name: string; value: string }>;
  dateRange: Array<{ startTime: string; endTime: string }>;
  lastUpdated: string | null;
  fetchedAt: string;
  version: 2;
  aggInterval?: string;
  confidenceInfo?: {
    level: number;
    annotations: Array<{ dataSource: string; description: string; startDate: string; endDate: string; eventType: string; isInstantaneous: boolean }>;
  };
  coverage?: { startTime: string; endTime: string; expectedDays: number; observedDays: number; missingDays: string[] };
  unavailable?: Array<{ series: string; reason: "missing" | "non-finite"; period?: string }>;
}
const BASE = "https://api.cloudflare.com/client/v4/radar";
const DAY = 86_400_000;
export const RADAR_SOURCE = "radar-v2";
export const RADAR_GROUPS = ["bot-share", "crawl-refer", "operator", "crawl-purpose"] as const;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function radarPurposeWindow(now = new Date()): { startTime: string; endTime: string } {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { startTime: new Date(end - 28 * DAY).toISOString(), endTime: new Date(end).toISOString() };
}
export function radarPurposeEndpoint(now = new Date()): string {
  const window = radarPurposeWindow(now);
  // This low-cardinality dimension rejects limitPerGroup. Dates bound the work instead.
  return "/ai/bots/timeseries_groups/CRAWL_PURPOSE?" + new URLSearchParams({
    dateStart: window.startTime, dateEnd: window.endTime, aggInterval: "1d", normalization: "PERCENTAGE",
  });
}
export function parseRadar(group: string, body: unknown, now = new Date()): { rows: SeriesRow[]; metadata: RadarMetadata } {
  if (!(RADAR_GROUPS as readonly string[]).includes(group)) throw new Error("Radar unknown group");
  const result = object(body) && object(body.result) ? body.result : null;
  const meta = result && object(result.meta) ? result.meta : null;
  const metadata = meta ? publicRadarMetadata({
    normalization: meta.normalization, units: meta.units, dateRange: meta.dateRange,
    lastUpdated: meta.lastUpdated, aggInterval: meta.aggInterval, confidenceInfo: meta.confidenceInfo,
    fetchedAt: now.toISOString(), version: 2,
  }) : null;
  if (!object(body) || body.success !== true || !metadata || metadata.dateRange.length !== 1) {
    throw new Error("Radar response missing verified units/window metadata");
  }
  const rows: SeriesRow[] = [];
  if (group === "operator" || group === "crawl-purpose") {
    const serie = object(result?.serie_0) ? result.serie_0 : null, timestamps = serie?.timestamps;
    if (!Array.isArray(timestamps) || !timestamps.length || timestamps.length > 32) throw new Error("Radar timeseries missing or excessive timestamps");
    const names = Object.keys(serie!).filter((name) => name !== "timestamps");
    if (!names.length || names.length > 20 || names.some((name) => !name.trim() || name.length > 100 || /[\u0000-\u001f]/.test(name))) throw new Error("Radar invalid series names");
    const sourceStart = Date.parse(metadata.dateRange[0].startTime), sourceEnd = Date.parse(metadata.dateRange[0].endTime);
    const purposeWindow = radarPurposeWindow(now), windowStart = Date.parse(purposeWindow.startTime), windowEnd = Date.parse(purposeWindow.endTime);
    if (group === "crawl-purpose" && (metadata.aggInterval !== "ONE_DAY" || metadata.normalization !== "PERCENTAGE" ||
      sourceStart < windowStart || sourceEnd > windowEnd || sourceStart % DAY !== 0 || sourceEnd % DAY !== 0)) throw new Error("Radar invalid purpose window or units");
    const completeDays = new Set<string>();
    const periods = timestamps.map((timestamp, i) => {
      const time = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
      if (!Number.isFinite(time) || group === "crawl-purpose" && (time < sourceStart || time > sourceEnd || time % DAY !== 0) ||
        i > 0 && time <= Date.parse(timestamps[i - 1])) throw new Error("Radar invalid point timestamp");
      const period = new Date(time).toISOString().slice(0, 10);
      if (time < sourceEnd) completeDays.add(period);
      return { period, time };
    });
    for (const name of names) {
      const values = serie![name];
      if (!Array.isArray(values) || values.length !== timestamps.length) throw new Error("Radar series length mismatch");
      values.forEach((value, i) => {
        const { period, time } = periods[i], series = group + ":" + name;
        // The API end bound is inclusive; a point at that boundary starts an incomplete day.
        if (group === "crawl-purpose" && time === sourceEnd) return;
        if (group === "crawl-purpose" && value === null) {
          completeDays.delete(period);
          (metadata.unavailable ??= []).push({ series, reason: "missing", period });
          return;
        }
        if ((typeof value !== "number" && typeof value !== "string") || typeof value === "string" && !value.trim() ||
          !Number.isFinite(Number(value)) || Number(value) < 0 || group === "crawl-purpose" && Number(value) > 100) throw new Error("Radar invalid point");
        rows.push({ source: RADAR_SOURCE, series, period, value: Number(value) });
      });
    }
    if (group === "crawl-purpose") {
      const days = Array.from({ length: 28 }, (_, i) => new Date(windowStart + i * DAY).toISOString().slice(0, 10));
      metadata.coverage = { ...purposeWindow, expectedDays: 28, observedDays: completeDays.size, missingDays: days.filter((day) => !completeDays.has(day)) };
    }
  } else {
    if (!object(result?.summary_0) || !Object.keys(result.summary_0).length || Object.keys(result.summary_0).length > 100) throw new Error("Radar summary missing or excessive");
    for (const [name, value] of Object.entries(result.summary_0)) {
      const series = group + ":" + name;
      const parsed = radarSummaryValue(value, group === "crawl-refer" && metadata.normalization === "RATIO");
      if (typeof parsed === "string") {
        (metadata.unavailable ??= []).push({ series, reason: parsed });
      } else rows.push({ source: RADAR_SOURCE, series, period: metadata.dateRange[0].endTime.slice(0, 10), value: parsed });
    }
  }
  return { rows, metadata };
}
/** Ratios may have no finite denominator. Preserve that state instead of making it zero. */
export function radarSummaryValue(value: unknown, ratio: boolean): number | "missing" | "non-finite" {
  if (ratio && (value === null || value === "" || typeof value === "string" && /^(null|nan|n\/a)$/i.test(value.trim()))) return "missing";
  if (ratio && typeof value === "string" && /^(?:\+?inf(?:inity)?|\u221e)$/i.test(value.trim())) return "non-finite";
  if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim()) throw new Error("Radar invalid summary value");
  const parts = ratio && typeof value === "string" ? value.match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/) : null;
  const number = parts ? Number(parts[1]) / Number(parts[2]) : Number(value);
  if (parts && Number(parts[2]) === 0) return Number(parts[1]) === 0 ? "missing" : "non-finite";
  if (!Number.isFinite(number) || number < 0) throw new Error("Radar invalid summary value");
  return number;
}
/** One request with no retries; the durable attempt checkpoint enforces the daily cost bound. */
async function fetchPurpose(url: string, token: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { headers: { ...OUTBOUND_HEADERS, authorization: "Bearer " + token },
    signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "error" });
  let body: unknown = null;
  try { body = await response.json(); } catch { /* malformed JSON is an unavailable observation */ }
  return { status: response.status, body };
}
/** Whole snapshots retain a common normalization basis. Never splice rolling normalized windows. */
export const radarJob: Job = async (ctx) => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) return { outcome: "disabled", stats: { skipped: "Radar token not configured" } };
  const endpoints = [
    ["bot-share", "/bots/summary/bot?dateRange=7d&limitPerGroup=15"],
    ["crawl-refer", "/bots/crawlers/summary/CRAWL_REFER_RATIO?dateRange=7d"],
    ["operator", "/bots/timeseries_groups/bot_operator?dateRange=28d&aggInterval=1d&limitPerGroup=8"],
    ["crawl-purpose", radarPurposeEndpoint()],
  ] as const;
  const failed: string[] = [];
  let rows = 0, partial = false;
  const unavailable: string[] = [];
  const attemptedToday: string[] = [];
  for (const [group, endpoint] of endpoints) {
    if (timeLeft(ctx) < 5_000) { partial = true; break; }
    try {
      const key = "radar:" + group;
      const snapshot = await readCollectorState<Record<string, unknown>>(ctx.db, key, {});
      const cachedMetadata = publicRadarMetadata(snapshot.state);
      // One successful snapshot per UTC day, avoiding alternate-day skips from cron jitter.
      if (cachedMetadata && cachedMetadata.fetchedAt.slice(0, 10) === new Date().toISOString().slice(0, 10) && Date.parse(cachedMetadata.fetchedAt) <= Date.now()) {
        if (cachedMetadata.unavailable?.length || cachedMetadata.coverage?.missingDays.length) { partial = true; unavailable.push(group); }
        continue;
      }
      if (group === "crawl-purpose") {
        const attemptKey = "radar-attempt:crawl-purpose";
        const attempt = await readCollectorState<Record<string, unknown>>(ctx.db, attemptKey, {});
        const day = new Date().toISOString().slice(0, 10);
        if (attempt.state.day === day || !await commitCollectorState(ctx.db, attemptKey, attempt, { day, attemptedAt: new Date().toISOString(), version: 1 })) {
          partial = true;
          attemptedToday.push(group);
          continue;
        }
        if (timeLeft(ctx) < 5_000) { partial = true; break; }
      }
      const timeoutMs = Math.min(20_000, timeLeft(ctx) - 2_000);
      const res = group === "crawl-purpose"
        ? await fetchPurpose(BASE + endpoint, token, timeoutMs)
        : await fetchJson<unknown>(BASE + endpoint, { headers: { authorization: "Bearer " + token } }, timeoutMs);
      if (res.status !== 200 || !res.body) throw new Error("HTTP " + res.status);
      const parsed = parseRadar(group, res.body);
      const committed = await commitCollectorState(ctx.db, key, snapshot, parsed.metadata, (guard) => [
        sql`delete from external_series where source = ${RADAR_SOURCE} and series like ${group + ":%"} and ${guard}`,
        ...seriesWrites(parsed.rows, guard),
      ]);
      if (committed) {
        rows += parsed.rows.length;
        if (parsed.metadata.unavailable?.length || parsed.metadata.coverage?.missingDays.length) { partial = true; unavailable.push(group); }
      }
      else partial = true;
    } catch (err) { failed.push(group + ": " + (err instanceof Error ? err.message : "fetch failed")); }
  }
  return { stats: { rows, failed, unavailable, attemptedToday }, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
