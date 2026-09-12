import type { LineSeries } from "@/components/census-charts";
import type { RadarMetadata } from "./ingest/radar";
import type { SeriesPoint } from "./stats-sources";

export type ReadingSnapshot = { series: Record<string, SeriesPoint[]>; metadata: Record<string, RadarMetadata> };
/** Expand the declared UTC window so a missing observation creates a line gap. */
export function readingLines(data: ReadingSnapshot): LineSeries[] {
  const meta = data.metadata["crawl-purpose"];
  if (!meta) return [];
  const start = Date.parse(meta.coverage?.startTime ?? meta.dateRange[0]?.startTime);
  const end = Date.parse(meta.coverage?.endTime ?? meta.dateRange[0]?.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 32*86400000) return [];
  const days: string[] = [];
  for(let t=start; t<end; t+=86400000) days.push(new Date(t).toISOString().slice(0,10));
  return Object.entries(data.series).filter(([key]) => key.startsWith("crawl-purpose:")).slice(0,8).map(([key, points],i) => {
    const values = new Map(points.map(p => [p.period, p.value]));
    return { key, label:key.slice("crawl-purpose:".length).replaceAll("_"," ").toLowerCase(),
      style:i===0 ? "accent" : i===1 ? "control" : "ink",
      points:days.map(x => ({x, y:values.get(x) ?? null})),
    };
  });
}
