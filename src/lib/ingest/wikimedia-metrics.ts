import { compactDay, dayOf, daysAgo } from "@/lib/format";
import { fetchJson } from "./common";

const METRICS = "https://wikimedia.org/api/rest_v1/metrics/edits/aggregate";
/** Beyond this lag the publisher is unusually late and the collector reports partial coverage. */
export const METRICS_LAG_PARTIAL_DAYS = 45;

/**
 * Wikimedia's edit metrics are published per complete month, weeks after the month ends.
 * A request whose start date is not loaded yet returns HTTP 404, which is upstream lag,
 * not a collector failure.
 */
export interface MetricsWindow { start: string; end: string; fallbackEnd: string | null }

export function nextDay(day: string): string {
  return new Date(Date.parse(day + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
}

export function previousMonthRange(today: string): { first: string; last: string } {
  const [year, month] = today.split("-").map(Number);
  return {
    first: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
    last: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
  };
}

/** Days after the last stored one, with the last complete month as the fallback end when recent days are not loaded. */
export function metricsWindow(loadedThrough: string | null, today = dayOf()): MetricsWindow | null {
  const previous = previousMonthRange(today);
  const start = loadedThrough ? nextDay(loadedThrough) : previous.first;
  const end = daysAgo(2, new Date(today + "T00:00:00Z"));
  if (start > end) return null;
  return { start, end, fallbackEnd: previous.last >= start ? previous.last : null };
}

export function lagDays(loadedThrough: string | null, today = dayOf()): number | null {
  if (!loadedThrough) return null;
  return Math.max(0, Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(loadedThrough + "T00:00:00Z")) / 86_400_000));
}

export type MetricsResult = Map<string, number> | "not-loaded";

export async function fetchEditMetrics(project: string, editor: string, start: string, end: string): Promise<MetricsResult> {
  const { status, body } = await fetchJson<{ items?: Array<{ results?: Array<{ timestamp: string; edits: number }> }> }>(
    `${METRICS}/${project}/${editor}/all-page-types/daily/${compactDay(start)}/${compactDay(end)}`,
  );
  if (status === 404) return "not-loaded";
  const values = body?.items?.[0]?.results;
  if (status !== 200 || !Array.isArray(values)) throw new Error(`wikimedia metrics ${project}/${editor} ${status}: missing results`);
  const map = new Map<string, number>();
  for (const value of values) {
    if (typeof value?.timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value.timestamp) || !Number.isFinite(value.edits) || value.edits < 0) {
      throw new Error(`wikimedia metrics ${project}/${editor}: invalid observation`);
    }
    map.set(value.timestamp.slice(0, 10), value.edits);
  }
  return map;
}

/** Probe recent days first, then the last complete month. Null means nothing new is loaded upstream. */
export async function resolveLoadedWindow(project: string, editor: string, window: MetricsWindow): Promise<{ end: string; first: Map<string, number> } | null> {
  const recent = await fetchEditMetrics(project, editor, window.start, window.end);
  if (recent !== "not-loaded") return { end: window.end, first: recent };
  if (!window.fallbackEnd) return null;
  const month = await fetchEditMetrics(project, editor, window.start, window.fallbackEnd);
  return month === "not-loaded" ? null : { end: window.fallbackEnd, first: month };
}
