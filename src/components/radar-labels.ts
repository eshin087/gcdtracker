import type { RadarMetadata } from "@/lib/ingest/radar";
export function radarUnit(meta: RadarMetadata | undefined): string {
  if (!meta) return "unit unavailable";
  switch (meta.normalization.toUpperCase()) {
    case "PERCENTAGE": return "percent";
    case "MIN0_MAX":
    case "MIN_MAX": return "normalized index";
    case "RAW_VALUES": return meta.units.length ? meta.units.map((u) => u.name + ": " + u.value).join(", ") : "raw source values";
    default: return "source normalization: " + meta.normalization;
  }
}
export function radarValue(value: number, meta: RadarMetadata | undefined): string {
  const number = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return meta?.normalization.toUpperCase() === "PERCENTAGE" ? number + "%" : number;
}

export function isRadarStale(fetchedAt: string | undefined, at: Date = new Date()): boolean {
  return !fetchedAt || !Number.isFinite(Date.parse(fetchedAt)) || at.getTime() - Date.parse(fetchedAt) > 2 * 86_400_000;
}
