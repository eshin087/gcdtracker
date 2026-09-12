import { fmtInt } from "./format";
import type { SourceOutcome } from "./health";

export interface FlowNode { id: string; label: string; total: number; }
export interface FlowSource extends FlowNode {
  feed: string;
  unit: "requests" | "PR matches" | "edits" | "files" | "changesets" | "posts" | "% share";
  purpose: string;
  evidence: string;
  method: string;
  href: string;
  observedDays: number;
  latestObservation: string | null;
  coverageLabel?: string;
  details?: Array<{ label: string; value: string }>;
  comparisonGroup?: string;
}
export interface FlowFeed {
  key: string;
  label: string;
  outcome: SourceOutcome | "unknown";
  lastRun: string | null;
  stale: boolean;
  outcomeLabel?: string;
  lastRunLabel?: string;
}
export interface FlowLink { source: string; target: string; value: number; }
export interface FlowData {
  sources: FlowSource[];
  targets: Array<Pick<FlowNode, "id" | "label">>;
  links: FlowLink[];
  feeds: FlowFeed[];
  days: number;
  windowStart: string;
  windowEnd: string;
  mode: "observed" | "demo" | "offline";
  windowLabel?: string;
  sourceHeading?: string;
  targetHeading?: string;
  scaleNote?: string;
  emptyMessage?: string;
}
export const FLOW_TARGETS: FlowData["targets"] = [
  { id: "code", label: "Code repositories" },
  { id: "wikis", label: "Encyclopedias & wikis" },
  { id: "maps", label: "Maps" },
  { id: "forums", label: "Forums" },
];
/** Compare only the same publisher, unit and observation group, never unrelated totals. */
export function flowWeight(source: FlowSource, sources: FlowSource[]): number {
  const max = Math.max(1, ...sources.filter(s => s.feed === source.feed && s.unit === source.unit && s.comparisonGroup === source.comparisonGroup).map(s => s.total));
  return Math.min(1, Math.max(0, source.total / max));
}
/** Shares already use percent units; never multiply them or round them to integers. */
export function formatFlowValue(value: number, unit: FlowSource["unit"]): string {
  if (unit === "% share" && value > 0 && value < 0.01) return "<0.01% share";
  return unit === "% share" ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) + "% share" : fmtInt(value) + " " + unit;
}
export function destinationCounts(target: string, data: FlowData): string {
  const totals = new Map<FlowSource["unit"], number>();
  for (const link of data.links.filter(l => l.target === target)) {
    const source = data.sources.find(s => s.id === link.source);
    if (source) totals.set(source.unit, (totals.get(source.unit) ?? 0) + link.value);
  }
  return [...totals].map(([unit, total]) => formatFlowValue(total, unit)).join(" · ") || "No observations";
}
