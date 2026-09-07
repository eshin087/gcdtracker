import { fmtInt } from "./format";
import type { SourceOutcome } from "./health";

export interface FlowNode { id: string; label: string; total: number; }
export interface FlowSource extends FlowNode {
  feed: string;
  unit: "requests" | "PR matches" | "edits" | "files" | "changesets" | "posts";
  purpose: string;
  evidence: string;
  method: string;
  href: string;
  observedDays: number;
  latestObservation: string | null;
  verification?: { matched: number; checkable: number; requests: number; signatureHeaders: number };
}
export interface FlowFeed {
  key: string;
  label: string;
  outcome: SourceOutcome | "unknown";
  lastRun: string | null;
  stale: boolean;
}
export interface FlowLink { source: string; target: string; value: number; }
export interface FlowData {
  sources: FlowSource[];
  targets: FlowNode[];
  links: FlowLink[];
  feeds: FlowFeed[];
  days: number;
  windowStart: string;
  windowEnd: string;
  mode: "observed" | "demo" | "offline";
}
export const FLOW_TARGETS: FlowNode[] = [
  { id: "code", label: "Code repositories", total: 0 },
  { id: "wikis", label: "Encyclopedias & wikis", total: 0 },
  { id: "maps", label: "Maps", total: 0 },
  { id: "forums", label: "Forums", total: 0 },
  { id: "site", label: "This website", total: 0 },
];
/** Compare only the same publisher and unit, never unrelated activity totals. */
export function flowWeight(source: FlowSource, sources: FlowSource[]): number {
  const max = Math.max(1, ...sources.filter(s => s.feed === source.feed && s.unit === source.unit).map(s => s.total));
  return Math.min(1, Math.max(0, source.total / max));
}
export function destinationCounts(target: string, data: FlowData): string {
  const totals = new Map<string, number>();
  for (const link of data.links.filter(l => l.target === target)) {
    const source = data.sources.find(s => s.id === link.source);
    if (source) totals.set(source.unit, (totals.get(source.unit) ?? 0) + link.value);
  }
  return [...totals].map(([unit, total]) => fmtInt(total) + " " + unit).join(" · ") || "No observations";
}
