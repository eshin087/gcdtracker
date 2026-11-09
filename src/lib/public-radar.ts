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
type Annotation = NonNullable<RadarMetadata["confidenceInfo"]>["annotations"][number];
/** An event may be open-ended or a single instant, so either date can be absent; a date that is present must parse. */
function annotation(entry: unknown): Annotation | null {
  if (!object(entry) || !text(entry.dataSource) || !text(entry.description, 2000) || !text(entry.eventType) || typeof entry.isInstantaneous !== "boolean") return null;
  if (entry.startDate != null && !timestamp(entry.startDate) || entry.endDate != null && !timestamp(entry.endDate)) return null;
  return { dataSource: entry.dataSource, description: entry.description, eventType: entry.eventType,
    startDate: timestamp(entry.startDate) ? entry.startDate : null, endDate: timestamp(entry.endDate) ? entry.endDate : null, isInstantaneous: entry.isInstantaneous };
}

export interface RadarMetadataRead {
  metadata: RadarMetadata | null;
  /** Supplementary fields left out because they failed validation, named with fixed words only. */
  dropped: string[];
}

/**
 * Only the measurement contract is public; collector revisions, cursors and future state remain private.
 * Normalization and the observation window are required. A supplementary publisher field that fails
 * validation is omitted and named, so one unexpected annotation cannot discard a whole snapshot.
 */
export function readRadarMetadata(value: unknown): RadarMetadataRead {
  const dropped: string[] = [];
  const rejected: RadarMetadataRead = { metadata: null, dropped };
  if (!object(value)) return rejected;
  const state = value;
  if (state.version !== 2 || !text(state.normalization) || !timestamp(state.fetchedAt) ||
      !Array.isArray(state.dateRange) || !state.dateRange.length || state.dateRange.length > 4) return rejected;
  const dateRange: RadarMetadata["dateRange"] = [];
  for (const range of state.dateRange) {
    if (!object(range) || !timestamp(range.startTime) || !timestamp(range.endTime) || Date.parse(range.startTime) >= Date.parse(range.endTime)) return rejected;
    dateRange.push({ startTime: range.startTime, endTime: range.endTime });
  }
  const units: RadarMetadata["units"] = [];
  if (state.units != null && (!Array.isArray(state.units) || state.units.length > 100)) dropped.push("units");
  else for (const unit of Array.isArray(state.units) ? state.units : []) {
    if (object(unit) && text(unit.name) && text(unit.value)) units.push({ name: unit.name, value: unit.value });
    else dropped.push("unit");
  }
  if (state.lastUpdated != null && !timestamp(state.lastUpdated)) dropped.push("lastUpdated");
  const metadata: RadarMetadata = {
    normalization: state.normalization, units, dateRange,
    lastUpdated: timestamp(state.lastUpdated) ? state.lastUpdated : null,
    fetchedAt: state.fetchedAt, version: 2,
  };
  if (text(state.aggInterval)) metadata.aggInterval = state.aggInterval;
  else if (state.aggInterval != null) dropped.push("aggInterval");
  if (state.confidenceInfo != null) {
    const confidence = state.confidenceInfo;
    if (!object(confidence) || typeof confidence.level !== "number" || !Number.isFinite(confidence.level) ||
      !Array.isArray(confidence.annotations) || confidence.annotations.length > 100) dropped.push("confidenceInfo");
    else {
      const annotations: Annotation[] = [];
      for (const entry of confidence.annotations) {
        const valid = annotation(entry);
        if (valid) annotations.push(valid);
        else dropped.push("annotation");
      }
      metadata.confidenceInfo = { level: confidence.level, annotations };
    }
  }
  // Coverage is computed by this collector, not supplied by the publisher, so a contradiction is not tolerated.
  if (state.coverage !== undefined) {
    const coverage = state.coverage;
    if (!object(coverage) || !timestamp(coverage.startTime) || !timestamp(coverage.endTime) || coverage.expectedDays !== 28 ||
      Date.parse(coverage.endTime) - Date.parse(coverage.startTime) !== 28 * 86_400_000 ||
      typeof coverage.observedDays !== "number" || !Number.isInteger(coverage.observedDays) || coverage.observedDays < 0 || coverage.observedDays > 28 ||
      !Array.isArray(coverage.missingDays) || coverage.missingDays.length !== 28 - coverage.observedDays) return rejected;
    const expected = new Set(Array.from({ length: 28 }, (_, i) => new Date(Date.parse(coverage.startTime as string) + i * 86_400_000).toISOString().slice(0, 10)));
    if (coverage.missingDays.some((day) => typeof day !== "string" || !expected.delete(day))) return rejected;
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
  return { metadata, dropped };
}

export function publicRadarMetadata(value: unknown): RadarMetadata | null {
  return readRadarMetadata(value).metadata;
}
