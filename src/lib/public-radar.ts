import type { RadarMetadata } from "@/lib/ingest/radar";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function text(value: unknown, max = 100): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
/** Only the measurement contract is public; collector revisions, cursors and future state remain private. */
export function publicRadarMetadata(value: unknown): RadarMetadata | null {
  if (!object(value)) return null;
  const state = value;
  if (state.version !== 2 || !text(state.normalization) || !timestamp(state.fetchedAt) ||
      !Array.isArray(state.dateRange) || !state.dateRange.length || state.dateRange.length > 4) return null;
  const dateRange: RadarMetadata["dateRange"] = [];
  for (const range of state.dateRange) {
    if (!object(range) || !timestamp(range.startTime) || !timestamp(range.endTime) || Date.parse(range.startTime) >= Date.parse(range.endTime)) return null;
    dateRange.push({ startTime: range.startTime, endTime: range.endTime });
  }
  const units: RadarMetadata["units"] = [];
  if (state.units !== undefined && (!Array.isArray(state.units) || state.units.length > 100)) return null;
  for (const unit of Array.isArray(state.units) ? state.units : []) {
    if (!object(unit) || !text(unit.name) || !text(unit.value)) return null;
    units.push({ name: unit.name, value: unit.value });
  }
  if (state.lastUpdated != null && !timestamp(state.lastUpdated)) return null;
  const metadata: RadarMetadata = {
    normalization: state.normalization, units, dateRange,
    lastUpdated: timestamp(state.lastUpdated) ? state.lastUpdated : null,
    fetchedAt: state.fetchedAt, version: 2,
  };
  if (state.aggInterval !== undefined) {
    if (!text(state.aggInterval)) return null;
    metadata.aggInterval = state.aggInterval;
  }
  if (state.confidenceInfo !== undefined) {
    const confidence = state.confidenceInfo;
    if (!object(confidence) || typeof confidence.level !== "number" || !Number.isFinite(confidence.level) ||
      !Array.isArray(confidence.annotations) || confidence.annotations.length > 100) return null;
    const annotations: NonNullable<RadarMetadata["confidenceInfo"]>["annotations"] = [];
    for (const entry of confidence.annotations) {
      if (!object(entry) || !text(entry.dataSource) || !text(entry.description, 2000) || !text(entry.eventType) ||
        !timestamp(entry.startDate) || !timestamp(entry.endDate) || typeof entry.isInstantaneous !== "boolean") return null;
      annotations.push({ dataSource: entry.dataSource, description: entry.description, eventType: entry.eventType,
        startDate: entry.startDate, endDate: entry.endDate, isInstantaneous: entry.isInstantaneous });
    }
    metadata.confidenceInfo = { level: confidence.level, annotations };
  }
  if (state.coverage !== undefined) {
    const coverage = state.coverage;
    if (!object(coverage) || !timestamp(coverage.startTime) || !timestamp(coverage.endTime) || coverage.expectedDays !== 28 ||
      Date.parse(coverage.endTime) - Date.parse(coverage.startTime) !== 28 * 86_400_000 ||
      typeof coverage.observedDays !== "number" || !Number.isInteger(coverage.observedDays) || coverage.observedDays < 0 || coverage.observedDays > 28 ||
      !Array.isArray(coverage.missingDays) || coverage.missingDays.length !== 28 - coverage.observedDays) return null;
    const expected = new Set(Array.from({ length: 28 }, (_, i) => new Date(Date.parse(coverage.startTime as string) + i * 86_400_000).toISOString().slice(0, 10)));
    if (coverage.missingDays.some((day) => typeof day !== "string" || !expected.delete(day))) return null;
    metadata.coverage = { startTime: coverage.startTime, endTime: coverage.endTime,
      expectedDays: 28, observedDays: coverage.observedDays, missingDays: [...coverage.missingDays] };
  }
  const unavailable: NonNullable<RadarMetadata["unavailable"]> = [];
  for (const item of Array.isArray(state.unavailable) ? state.unavailable.slice(0, 640) : []) {
    if (object(item) && text(item.series, 200) && (item.reason === "missing" || item.reason === "non-finite")) {
      const period = typeof item.period === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.period) && timestamp(item.period) ? item.period : undefined;
      unavailable.push({ series: item.series, reason: item.reason, ...(period ? { period } : {}) });
    }
  }
  if (unavailable.length) metadata.unavailable = unavailable;
  return metadata;
}
