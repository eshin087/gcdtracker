import type { RadarMetadata } from "@/lib/ingest/radar";

/** Only the measurement contract is public; collector revisions, cursors and future state remain private. */
export function publicRadarMetadata(value: unknown): RadarMetadata | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  if (state.version !== 2 || typeof state.normalization !== "string" ||
      typeof state.fetchedAt !== "string" || !Number.isFinite(Date.parse(state.fetchedAt)) ||
      !Array.isArray(state.dateRange) || !state.dateRange.length) return null;
  const dateRange: RadarMetadata["dateRange"] = [];
  for (const item of state.dateRange) {
    if (!item || typeof item !== "object") return null;
    const range = item as Record<string, unknown>;
    if (typeof range.startTime !== "string" || typeof range.endTime !== "string" ||
        !Number.isFinite(Date.parse(range.startTime)) || !Number.isFinite(Date.parse(range.endTime))) return null;
    dateRange.push({ startTime: range.startTime, endTime: range.endTime });
  }
  const units: RadarMetadata["units"] = [];
  for (const item of Array.isArray(state.units) ? state.units : []) {
    if (!item || typeof item !== "object") continue;
    const unit = item as Record<string, unknown>;
    if (typeof unit.name === "string" && typeof unit.value === "string") units.push({ name: unit.name, value: unit.value });
  }
  const unavailable: NonNullable<RadarMetadata["unavailable"]> = [];
  for (const item of Array.isArray(state.unavailable) ? state.unavailable : []) {
    if (item && typeof item === "object" && typeof item.series === "string" &&
        (item.reason === "missing" || item.reason === "non-finite")) unavailable.push({series:item.series,reason:item.reason});
  }
  return {
    ...(unavailable.length ? {unavailable} : {}),
    normalization: state.normalization, units, dateRange,
    lastUpdated: typeof state.lastUpdated === "string" ? state.lastUpdated : null,
    fetchedAt: state.fetchedAt, version: 2,
  };
}
