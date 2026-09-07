export type SourceOutcome = "success" | "partial" | "failed" | "disabled";
export type SourceHealth = { source: string; outcome: SourceOutcome; lastRun: string; stale: boolean; expectedIntervalSeconds: number };
const INTERVALS: Record<string, number> = { gharchive: 3 * 3600, "robots-census": 7 * 86400, "ai-robots-history": 31 * 86400 };
export function sourceHealth(run: { source: string; finishedAt: Date | string; ok: boolean; stats: Record<string, unknown> | null }, now = Date.now()): SourceHealth {
  const stats = run.stats ?? {};
  const raw = stats.outcome;
  const outcome: SourceOutcome = raw === "success" || raw === "partial" || raw === "failed" || raw === "disabled" ? raw :
    stats.skipped ? "disabled" : stats.partial ? "partial" : run.ok ? "success" : "failed";
  const expectedIntervalSeconds = INTERVALS[run.source] ?? 1800;
  const lastRun = new Date(run.finishedAt).toISOString();
  return { source: run.source, outcome, lastRun, expectedIntervalSeconds,
    stale: outcome !== "disabled" && now - Date.parse(lastRun) > expectedIntervalSeconds * 2000 };
}
export function sensorStatus(sources: SourceHealth[]): "live" | "stale" | "degraded" {
  if (sources.some((s) => s.outcome === "failed")) return "degraded";
  if (!sources.length || sources.some((s) => s.stale)) return "stale";
  if (sources.some((s) => s.outcome === "partial")) return "degraded";
  return "live";
}
