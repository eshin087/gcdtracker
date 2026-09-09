import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { ingestRuns } from "@/lib/db/schema";
import { SITE } from "@/lib/site";

export interface JobContext {
  db: Db;
  /** epoch ms by which the job must return */
  deadline: number;
  /** optional request body handed to the job (e.g. a file the scheduler fetched on our behalf) */
  payload?: string;
  /** query string of the triggering request (jobs that answer status questions read it) */
  query?: URLSearchParams;
}

export type JobOutcome = "success" | "partial" | "failed" | "disabled";

export interface JobResult {
  outcome?: JobOutcome;
  error?: string;
  stats: Record<string, unknown>;
  cursor?: string | null;
  partial?: boolean;
}

export type Job = (ctx: JobContext) => Promise<JobResult>;

export interface RunReport {
  outcome: JobOutcome;
  source: string;
  ok: boolean;
  ms: number;
  stats: Record<string, unknown>;
  cursor?: string | null;
  partial?: boolean;
  error?: string;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const timeLeft = (ctx: JobContext) => ctx.deadline - Date.now();

export const OUTBOUND_HEADERS: Record<string, string> = {
  "user-agent": SITE.userAgent,
  "api-user-agent": SITE.userAgent,
  accept: "application/json",
};

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<{ status: number; body: T | null; headers: Headers }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const retryable = (init.method ?? "GET").toUpperCase() === "GET";
    for (let attempt=0;;attempt++) {
      const res = await fetch(url, { ...init, headers: { ...OUTBOUND_HEADERS, ...(init.headers as Record<string, string> | undefined) }, signal: ctl.signal, cache: "no-store" });
      // One retry within the original deadline; never retry writes or an access denial.
      if (retryable && attempt===0 && [502,503,504].includes(res.status)) {
        await res.body?.cancel();
        await sleep(Math.min(250,Math.max(0,timeoutMs/10)));
        continue;
      }
      let body: T | null = null;
      try { body = (await res.json()) as T; } catch { body = null; }
      return { status: res.status, body, headers: res.headers };
    }
  } finally {
    clearTimeout(t);
  }
}

/** Most recent non-null cursor stored for a source. */
export async function lastCursor(db: Db, source: string): Promise<string | null> {
  const [row] = await db
    .select({ cursor: ingestRuns.cursor })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.source, source), isNotNull(ingestRuns.cursor), or(eq(ingestRuns.ok, true), sql`${ingestRuns.stats}->>'outcome' = 'partial'`)))
    .orderBy(desc(ingestRuns.startedAt))
    .limit(1);
  return row?.cursor ?? null;
}

/** Compatibility for collectors being moved to explicit outcomes. */
export function jobOutcome(result: JobResult): JobOutcome {
  if (result.outcome) return result.outcome;
  if ((Array.isArray(result.stats.failed) && result.stats.failed.length > 0) || (typeof result.stats.failures === "number" && result.stats.failures > 0)) return "failed";
  if (result.stats.skipped) return "disabled";
  if (result.partial || result.stats.partial === true) return "partial";
  return "success";
}

/** Run one job. Status reads use record:false and never alter freshness/run history. */
export async function runJob(source: string, job: Job, ctx: JobContext, options: { record?: boolean } = {}): Promise<RunReport> {
  const startedAt = new Date();
  let report: RunReport;
  try {
    const result = await job(ctx);
    const outcome = jobOutcome(result);
    report = { source, outcome, ok: outcome === "success", ms: Date.now() - startedAt.getTime(), stats: result.stats, cursor: result.cursor, partial: outcome === "partial", error: result.error };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`ingest ${source} failed`, err);
    report = { source, outcome: "failed", ok: false, ms: Date.now() - startedAt.getTime(), stats: {}, error: message.slice(0, 500) };
  }
  if (options.record === false) return report;
  try {
    await ctx.db.insert(ingestRuns).values({
      source,
      startedAt,
      finishedAt: new Date(),
      ok: report.ok,
      cursor: report.cursor ?? null,
      stats: { ...report.stats, outcome: report.outcome, partial: report.partial ?? false },
      error: report.error ?? null,
    });
  } catch (err) {
    console.error("could not record ingest run", err);
    report = { ...report, ok: false, outcome: "failed", error: "could not persist ingest outcome" };
  }
  return report;
}
