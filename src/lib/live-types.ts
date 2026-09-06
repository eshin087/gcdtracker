export interface LiveInfo {
  /** database reachable */
  db: boolean;
  lastAiVisit: string | null;
  lastIngest: string | null;
  aiVisits24h: number;
  generatedAt: string;
}
