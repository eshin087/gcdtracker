export type SourceOutcome = "success" | "partial" | "failed" | "disabled";
export type SourceHealth = {
  source: string;
  outcome: SourceOutcome;
  lastRun: string;
  stale: boolean;
  schedule: "daily" | "unscheduled";
  /** Zero means there is no scheduled freshness deadline. */
  expectedIntervalSeconds: number;
};

// These payload receivers retain historical data but have no scheduled workers.
const UNSCHEDULED_SOURCES = new Set(["gharchive", "robots-census", "ai-robots-history"]);
const DAILY_INTERVAL_SECONDS = 86_400;
const MISSED_INTERVALS_BEFORE_STALE = 2;

export function sourceHealth(run: { source: string; finishedAt: Date | string; ok: boolean; stats: Record<string, unknown> | null }, now = Date.now()): SourceHealth {
  const stats = run.stats ?? {};
  const raw = stats.outcome;
  const outcome: SourceOutcome = raw === "success" || raw === "partial" || raw === "failed" || raw === "disabled" ? raw :
    stats.skipped ? "disabled" : stats.partial ? "partial" : run.ok ? "success" : "failed";
  const schedule = UNSCHEDULED_SOURCES.has(run.source) ? "unscheduled" : "daily";
  const expectedIntervalSeconds = schedule === "daily" ? DAILY_INTERVAL_SECONDS : 0;
  const lastRun = new Date(run.finishedAt).toISOString();
  return {
    source: run.source,
    outcome,
    lastRun,
    schedule,
    expectedIntervalSeconds,
    stale: schedule === "daily" && outcome !== "disabled" &&
      now - Date.parse(lastRun) > expectedIntervalSeconds * MISSED_INTERVALS_BEFORE_STALE * 1000,
  };
}

export function sensorStatus(sources: SourceHealth[]): "live" | "stale" | "degraded" {
  const active = sources.filter((source) => source.schedule !== "unscheduled" && source.outcome !== "disabled");
  if (active.some((source) => source.outcome === "failed")) return "degraded";
  if (!active.length || active.some((source) => source.stale)) return "stale";
  if (active.some((source) => source.outcome === "partial")) return "degraded";
  return "live";
}
