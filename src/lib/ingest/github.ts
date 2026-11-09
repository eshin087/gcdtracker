import { and, eq, gte, sql } from "drizzle-orm";
import { externalSeries, githubDaily, githubEvents } from "@/lib/db/schema";
import { dayRange, daysAgo } from "@/lib/format";
import { GITHUB_AGENTS, type GithubAgent } from "@/lib/github/agents";
import { SEARCH_CENSUS_SOURCE, SEARCH_REFERENCES, type SearchReference } from "@/lib/github/search-census";
import { fetchJson, type Job, type JobContext, sleep, timeLeft } from "./common";

const SEARCH = "https://api.github.com/search/issues";
/** A search answers within a second or two. A shorter timeout than the shared default keeps the reserve each call needs small. */
const SEARCH_TIMEOUT_MS = 12_000;
/** No pause is honoured for longer than this within one invocation. */
const MAX_PAUSE_MS = 15 * 60_000;
/** Earlier UTC days checked for missing census counts once the previous day is complete. */
export const CATCH_UP_DAYS = 6;

export interface SearchItem {
  id: number;
  body?: string | null;
  user?: { id: number; login: string; type?: string };
  state?: string;
  updated_at?: string;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  created_at: string;
}
export interface SearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
  items?: SearchItem[];
  message?: string;
}

/** Search API pacing: 10/min unauthenticated, 30/min with a token. */
export function gapMs(): number {
  return process.env.GITHUB_TOKEN ? 2_100 : 6_500;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export type PauseBasis = "retry-after" | "window-reset" | "default-minute";
interface Pause { until: number; basis: PauseBasis }

export class RateLimited extends Error {
  constructor(public readonly resetAt: number, public readonly basis: PauseBasis = "default-minute") {
    super("github rate limited");
  }
}

let lastCall = 0;
/** Until when GitHub asked for no further search requests. Module state, so every job in one invocation honours it. */
let pause: Pause = { until: 0, basis: "default-minute" };

/** Test hook: forget the pacing and pause left by an earlier case. */
export function resetSearchState(): void {
  lastCall = 0;
  pause = { until: 0, basis: "default-minute" };
}

/**
 * How long GitHub asked us to stop, in its documented order: honour retry-after; otherwise wait
 * for the window reset when no requests remain; otherwise wait one minute.
 */
export function searchPause(headers: Headers, now = Date.now()): Pause {
  const retryAfter = headers.get("retry-after");
  const seconds = retryAfter === null || !retryAfter.trim() ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return { until: now + Math.min(seconds * 1000, MAX_PAUSE_MS), basis: "retry-after" };
  const reset = Number(headers.get("x-ratelimit-reset")) * 1000;
  if (headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) && reset > now) return { until: Math.min(reset, now + MAX_PAUSE_MS), basis: "window-reset" };
  return { until: now + 60_000, basis: "default-minute" };
}

/** One paced search call. Throws RateLimited when GitHub refuses the request or has asked us to wait. */
export async function search(q: string, extra: Record<string, string> = {}): Promise<SearchResponse> {
  if (Date.now() < pause.until) throw new RateLimited(pause.until, pause.basis);
  const wait = lastCall + gapMs() - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const qs = new URLSearchParams({ q, per_page: "1", ...extra });
  const { status, body, headers: h } = await fetchJson<SearchResponse>(`${SEARCH}?${qs}`, { headers: headers() }, SEARCH_TIMEOUT_MS);
  if (status === 403 || status === 429) {
    pause = searchPause(h);
    throw new RateLimited(pause.until, pause.basis);
  }
  if (status !== 200 || !body) throw new Error(`github search ${status} ${body?.message ?? ""}`.trim());
  validateSearchResponse(body);
  // The window's last permitted request: wait for the reset instead of drawing a refusal.
  const reset = Number(h.get("x-ratelimit-reset")) * 1000;
  if (h.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset) && reset > Date.now()) {
    pause = { until: Math.min(reset, Date.now() + MAX_PAUSE_MS), basis: "window-reset" };
  }
  return body;
}

/** HTTP 200 can still be an incomplete search; never persist it as zero. */
export function validateSearchResponse(body: SearchResponse): void {
  if (body.incomplete_results !== false || !Number.isSafeInteger(body.total_count) || body.total_count! < 0 || !Array.isArray(body.items)) {
    throw new Error("github search incomplete or malformed; retaining previous observations");
  }
}

/** Time one more paced call may need: the pacing gap, the request timeout and the write that follows. */
function callReserveMs(): number {
  return gapMs() + SEARCH_TIMEOUT_MS + 2_000;
}

/** Budget-aware: returns false when the deadline is too close for another paced call. */
export function canCall(ctx: JobContext): boolean {
  return timeLeft(ctx) > callReserveMs();
}

/**
 * A search that waits out a pause GitHub asked for when the job's slice can afford it, and
 * otherwise throws RateLimited without sending a request. One retry after one wait.
 */
export async function budgetedSearch(ctx: JobContext, q: string, extra: Record<string, string> = {}): Promise<SearchResponse> {
  for (let attempt = 0; ; attempt++) {
    const wait = pause.until - Date.now();
    if (wait > 0) {
      if (timeLeft(ctx) - wait <= callReserveMs()) throw new RateLimited(pause.until, pause.basis);
      await sleep(wait + 250);
    }
    try {
      return await search(q, extra);
    } catch (err) {
      if (!(err instanceof RateLimited) || attempt > 0) throw err;
    }
  }
}

/** Records what GitHub asked for, so the run log shows which limit applied. */
export function noteRateLimit(stats: Record<string, unknown>, err: RateLimited): void {
  stats.rateLimitedUntil = new Date(err.resetAt).toISOString();
  stats.rateLimitBasis = err.basis;
  stats.stopped = "rate limited";
}

/** One finalized count of the search census: a detector or a reference (denominator or overlap). */
export interface CensusCall { day: string; agent?: GithubAgent; ref?: SearchReference }

/** Counts one UTC day still lacks: detector finals first, then the reference counts. */
export function censusGaps(day: string, finalDetectors: ReadonlySet<string>, references: ReadonlySet<string>): CensusCall[] {
  return [
    ...GITHUB_AGENTS.filter((agent) => !finalDetectors.has(`${day}|${agent.key}`)).map((agent) => ({ day, agent })),
    ...SEARCH_REFERENCES.filter((ref) => !references.has(`${day}|${ref.series}`)).map((ref) => ({ day, ref })),
  ];
}

/**
 * The most recent earlier day that still lacks counts, so a missed or interrupted run is
 * repaired while the day is recent. One day per run: every query spent here is taken from
 * the collectors that share the search allowance.
 */
export function catchUpWork(days: string[], finalDetectors: ReadonlySet<string>, references: ReadonlySet<string>): CensusCall[] {
  for (const day of [...days].sort().reverse()) {
    const gaps = censusGaps(day, finalDetectors, references);
    if (gaps.length) return gaps;
  }
  return [];
}

async function count(ctx: JobContext, call: CensusCall): Promise<void> {
  if (call.agent) {
    const { agent, day } = call;
    const prs = (await budgetedSearch(ctx, `is:pr ${agent.query} created:${day}`)).total_count!;
    await ctx.db
      .insert(githubDaily)
      .values({ day, agent: agent.key, prs, tier: agent.tier, final: true, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: [githubDaily.day, githubDaily.agent], set: { prs, final: true, fetchedAt: new Date() } });
  } else if (call.ref) {
    const { ref, day } = call;
    const body = await budgetedSearch(ctx, `is:pr created:${day} ${ref.query}`.trim());
    await ctx.db
      .insert(externalSeries)
      .values({ source: SEARCH_CENSUS_SOURCE, series: ref.series, period: day, value: body.total_count!, lo: null, hi: null })
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }
}

/**
 * Required, in priority order: every count for the previous UTC day, then one rotating
 * sample-feed query. The current UTC day is never counted provisionally; an incomplete day is
 * not an observation. Only after both does the run repair one earlier day that lacks counts.
 * Days older than the catch-up window keep whatever was recorded for them.
 */
export const githubJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { queries: 0 };
  const yesterday = daysAgo(1);
  const since = daysAgo(1 + CATCH_UP_DAYS);

  const rows = await ctx.db
    .select({ day: githubDaily.day, agent: githubDaily.agent, final: githubDaily.final })
    .from(githubDaily)
    .where(gte(githubDaily.day, since));
  const finalDetectors = new Set(rows.filter((r) => r.final).map((r) => `${r.day}|${r.agent}`));
  const refRows = await ctx.db
    .select({ period: externalSeries.period, series: externalSeries.series })
    .from(externalSeries)
    .where(and(eq(externalSeries.source, SEARCH_CENSUS_SOURCE), gte(externalSeries.period, since)));
  const references = new Set(refRows.map((r) => `${r.period}|${r.series}`));

  const required = censusGaps(yesterday, finalDetectors, references);
  const catchUp = catchUpWork(dayRange(since, daysAgo(2)), finalDetectors, references);
  let done = 0, caughtUp = 0, sampled = false;
  const counted = async (call: CensusCall) => {
    await count(ctx, call);
    stats.queries = (stats.queries as number) + 1;
  };

  try {
    for (const call of required) {
      if (!canCall(ctx)) { stats.stopped = "deadline"; break; }
      await counted(call);
      done++;
    }

    // Sample feed: one agent per run, rotating by UTC day so each agent is sampled in turn.
    if (!stats.stopped) {
      if (!canCall(ctx)) stats.stopped = "deadline";
      else {
        const agent = GITHUB_AGENTS[Math.floor(Date.now() / 86_400_000) % GITHUB_AGENTS.length];
        const body = await budgetedSearch(ctx, `is:pr ${agent.query}`, { sort: "created", order: "desc", per_page: "30" });
        stats.queries = (stats.queries as number) + 1;
        const items = (body.items ?? []).filter((i) => i.id && i.html_url);
        if (items.length > 0) {
          await ctx.db
            .insert(githubEvents)
            .values(
              items.map((i) => ({
                id: i.id,
                agent: agent.key,
                repo: i.repository_url.replace("https://api.github.com/repos/", "").slice(0, 200),
                number: i.number,
                title: i.title.slice(0, 300),
                url: i.html_url,
                createdAt: new Date(i.created_at),
              })),
            )
            .onConflictDoNothing();
        }
        stats.sample = `${agent.key}:${items.length}`;
        sampled = true;
      }
    }

  } catch (err) {
    if (!(err instanceof RateLimited)) throw err;
    noteRateLimit(stats, err);
  }

  // Best effort: a refusal or an unusable response here leaves the earlier day for the next run.
  if (!stats.stopped) {
    try {
      for (const call of catchUp) {
        if (!canCall(ctx)) { stats.stopped = "deadline"; break; }
        await counted(call);
        caughtUp++;
      }
    } catch (err) {
      if (err instanceof RateLimited) noteRateLimit(stats, err);
      else stats.catchUpError = (err instanceof Error ? err.message : String(err)).slice(0, 160);
    }
  }

  stats.yesterday = `${done}/${required.length}`;
  if (!sampled) stats.sampleFeed = typeof stats.stopped === "string" ? stats.stopped : "not run";
  if (catchUp.length) stats.catchUp = `${catchUp[0].day} ${caughtUp}/${catchUp.length}`;

  const [t] = await ctx.db
    .select({ prs: sql<number>`coalesce(sum(${githubDaily.prs}), 0)` })
    .from(githubDaily)
    .where(and(eq(githubDaily.day, yesterday), eq(githubDaily.tier, "bot-account")));
  stats.yesterdayBotPrs = Number(t?.prs ?? 0);
  // Catch-up is best effort; the outcome reflects only the previous day and the sample feed.
  return { stats, partial: done < required.length || !sampled };
};
