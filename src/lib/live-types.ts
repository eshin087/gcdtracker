import type { SourceHealth } from "./health";
export interface LiveInfo {
  db: boolean;
  status: "live" | "stale" | "offline" | "degraded";
  sources: SourceHealth[];
  lastAiVisit: string | null;
  lastIngest: string | null;
  aiVisits24h: number | null;
  generatedAt: string;
}
