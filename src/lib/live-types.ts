import type { SourceHealth } from "./health";
export interface LiveInfo {
  db: boolean;
  status: "live" | "stale" | "offline" | "degraded";
  sources: SourceHealth[];
  lastIngest: string | null;
  generatedAt: string;
}
