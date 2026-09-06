import { and, desc, eq, isNotNull } from "drizzle-orm";
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

export interface JobResult {
  stats: Record<string, unknown>;
  cursor?: string | null;
  partial?: boolean;
}

export type Job = (ctx: JobContext) => Promise<JobResult>;

export interface RunReport {
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
    const res = await fetch(url, { ...init, headers: { ...OUTBOUND_HEADERS, ...(init.headers as Record<string, string> | undefined) }, signal: ctl.signal, cache: "no-store" });
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { status: res.status, body, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

/** Most recent non-null cursor stored for a source. */
export async function lastCursor(db: Db, source: string): Promise<string | null> {
  const [row] = await db
    .select({ cursor: ingestRuns.cursor })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.source, source), isNotNull(ingestRuns.cursor)))
    .orderBy(desc(ingestRuns.startedAt))
    .limit(1);
  return row?.cursor ?? null;
}

/** Run one job, record it in ingest_runs, never throw. */
export async function runJob(source: string, job: Job, ctx: JobContext): Promise<RunReport> {
  const startedAt = new Date();
  let report: RunReport;
  try {
    const result = await job(ctx);
    report = { source, ok: true, ms: Date.now() - startedAt.getTime(), stats: result.stats, cursor: result.cursor, partial: result.partial };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`ingest ${source} failed`, err);
    report = { source, ok: false, ms: Date.now() - startedAt.getTime(), stats: {}, error: message.slice(0, 500) };
  }
  try {
    await ctx.db.insert(ingestRuns).values({
      source,
      startedAt,
      finishedAt: new Date(),
      ok: report.ok,
      cursor: report.cursor ?? null,
      stats: { ...report.stats, partial: report.partial ?? false },
      error: report.error ?? null,
    });
  } catch (err) {
    console.error("could not record ingest run", err);
  }
  return report;
}
