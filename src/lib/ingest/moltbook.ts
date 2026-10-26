import { sql } from "drizzle-orm";
import { dayOf, dayRange, daysAgo } from "@/lib/format";
import { fetchJson, type Job, timeLeft } from "./common";
import { commitCollectorState, readCollectorState, resultRows } from "./state";

const API = "https://www.moltbook.com/api/v1/posts";
const POST_URL = (id: string) => `https://www.moltbook.com/post/${id}`;
export const MOLTBOOK_STATE_KEY = "moltbook:coverage";
/** Bounds for one daily walk of the public feed; counts stop being complete once a bound is hit. */
export const MOLTBOOK_LIMITS = { pageSize: 100, maxPages: 60, lookbackDays: 7, storedPostsPerRun: 200, openDays: 3, cappedDaysKept: 90 } as const;

interface MoltPost {
  id: string;
  title: string;
  content?: string;
  author?: { id?: string | number; name?: string };
  submolt?: { name?: string };
  score?: number;
  comment_count?: number;
  is_deleted?: boolean;
  is_spam?: boolean;
  created_at: string;
}

interface MoltResponse {
  success?: boolean;
  posts?: MoltPost[];
  has_more?: boolean;
  next_cursor?: string | null;
}

/** Durable coverage for the daily feed walk. Posts themselves are not retained beyond a bounded sample. */
export interface MoltbookCoverage extends Record<string, unknown> {
  version: 1;
  /** created_at of the newest post already counted; the next walk stops at or before it. */
  countedThrough: string | null;
  /** UTC dates still receiving posts, with running counts and distinct posting accounts. */
  days: Record<string, { posts: number; agents: string[] }>;
  /** UTC dates whose counts are lower bounds because a walk ended before reaching countedThrough. */
  capped: string[];
}
const fresh = (): MoltbookCoverage => ({ version: 1, countedThrough: null, days: {}, capped: [] });

export function snippetOf(content: string | undefined): string | null {
  if (!content) return null;
  const s = content.replace(/\s+/g, " ").trim();
  return s.length > 280 ? `${s.slice(0, 277)}…` : s;
}

const agentName = (p: MoltPost) => (p.author?.name ?? "unknown").slice(0, 120);
const integer = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) ? value : null);

/**
 * Walks the feed from newest to the previous run's boundary, counting posts per UTC day in
 * memory. Daily counts and distinct accounts are complete only when the boundary is reached.
 */
export const moltbookJob: Job = async (ctx) => {
  const snapshot = await readCollectorState<MoltbookCoverage>(ctx.db, MOLTBOOK_STATE_KEY, fresh());
  const state = snapshot.state;
  const now = Date.now();
  const minTs = now - MOLTBOOK_LIMITS.lookbackDays * 86_400_000;
  let boundary = state.countedThrough ? Date.parse(state.countedThrough) : NaN;
  let base: MoltbookCoverage["days"] = { ...state.days };
  if (!Number.isFinite(boundary)) {
    // First walk: continue from the posts the earlier bounded poller stored, so counted days keep their totals.
    const seeded = resultRows<{ day: string; posts: number | string; agents: string[] | null; newest_ms: number | string | null }>(await ctx.db.execute(sql`
      select (ts at time zone 'UTC')::date::text as day, count(*)::int as posts, jsonb_agg(distinct agent) as agents,
        (extract(epoch from max(ts)) * 1000)::bigint as newest_ms
      from forum_posts where ts >= ${new Date(minTs)} group by 1`));
    base = {};
    let newest = NaN;
    for (const row of seeded) {
      base[String(row.day).slice(0, 10)] = { posts: Number(row.posts), agents: Array.isArray(row.agents) ? row.agents.filter((a): a is string => typeof a === "string") : [] };
      newest = Number.isFinite(newest) ? Math.max(newest, Number(row.newest_ms)) : Number(row.newest_ms);
    }
    boundary = Number.isFinite(newest) ? newest : minTs;
  }
  boundary = Math.max(boundary, minTs);

  const tallies = new Map<string, { posts: number; agents: Set<string> }>();
  const stored: MoltPost[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null, pages = 0, fetched = 0, counted = 0, reached = false;
  let newestMs: number | null = null, oldestMs: number | null = null;
  walk: for (let page = 0; page < MOLTBOOK_LIMITS.maxPages; page++) {
    if (timeLeft(ctx) < 10_000) break;
    const qs: URLSearchParams = new URLSearchParams({ sort: "new", limit: String(MOLTBOOK_LIMITS.pageSize), ...(cursor ? { cursor } : {}) });
    const res: { status: number; body: MoltResponse | null } = await fetchJson<MoltResponse>(`${API}?${qs}`);
    const { status, body } = res;
    if (status !== 200 || body?.success === false || !Array.isArray(body?.posts)) throw new Error(`moltbook ${status}: invalid or failed response`);
    pages++;
    const posts = body.posts.filter((p) => p && typeof p.id === "string" && p.id && typeof p.created_at === "string" && Number.isFinite(Date.parse(p.created_at)) && !p.is_deleted && !p.is_spam);
    fetched += posts.length;
    for (const p of posts) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const ms = Date.parse(p.created_at);
      if (ms <= boundary) { reached = true; break walk; }
      counted++;
      newestMs = newestMs === null ? ms : Math.max(newestMs, ms);
      oldestMs = oldestMs === null ? ms : Math.min(oldestMs, ms);
      const day = dayOf(new Date(ms));
      const tally = tallies.get(day) ?? { posts: 0, agents: new Set<string>() };
      tally.posts++;
      tally.agents.add(agentName(p));
      tallies.set(day, tally);
      if (stored.length < MOLTBOOK_LIMITS.storedPostsPerRun) stored.push(p);
    }
    if (!body.has_more) { reached = true; break; }
    if (!body.next_cursor || body.next_cursor === cursor) throw new Error("moltbook continuation missing or repeated");
    cursor = body.next_cursor;
  }
  if (!pages) return { outcome: "partial", stats: { pages, reason: "deadline before the first page" } };

  const touched: string[] = [];
  for (const [day, tally] of tallies) {
    const previous = base[day] ?? { posts: 0, agents: [] };
    base[day] = { posts: previous.posts + tally.posts, agents: [...new Set([...previous.agents, ...tally.agents])] };
    touched.push(day);
  }
  const cappedNow = !reached && oldestMs !== null ? dayRange(dayOf(new Date(boundary)), dayOf(new Date(oldestMs))) : [];
  const keepFrom = daysAgo(MOLTBOOK_LIMITS.openDays - 1, new Date(now));
  const next: MoltbookCoverage = {
    version: 1,
    countedThrough: new Date(newestMs ?? boundary).toISOString(),
    days: Object.fromEntries(Object.entries(base).filter(([day]) => day >= keepFrom)),
    capped: [...new Set([...state.capped, ...cappedNow])].sort().slice(-MOLTBOOK_LIMITS.cappedDaysKept),
  };
  const dailyRows = touched.map((day) => ({ day, posts: base[day].posts, agents: base[day].agents.length }));
  const postRows = stored.map((p) => ({
    id: p.id, agent: agentName(p), agent_id: p.author?.id == null ? null : String(p.author.id).slice(0, 120), ts: new Date(p.created_at).toISOString(),
    title: (p.title || "(untitled)").slice(0, 300), snippet: snippetOf(p.content), url: POST_URL(p.id), board: p.submolt?.name?.slice(0, 120) ?? null,
    score: integer(p.score), comments: integer(p.comment_count),
  }));
  const committed = await commitCollectorState(ctx.db, MOLTBOOK_STATE_KEY, snapshot, next, (guard) => [
    ...(dailyRows.length ? [sql`insert into forum_daily (day, posts, agents)
      select r.day::date, r.posts, r.agents from jsonb_to_recordset(${JSON.stringify(dailyRows)}::jsonb) as r(day text, posts integer, agents integer)
      where ${guard}
      on conflict (day) do update set posts = excluded.posts, agents = excluded.agents`] : []),
    ...(postRows.length ? [sql`insert into forum_posts (id, agent, agent_id, ts, title, snippet, url, board, score, comments)
      select r.id, r.agent, r.agent_id, r.ts::timestamptz, r.title, r.snippet, r.url, r.board, r.score, r.comments
      from jsonb_to_recordset(${JSON.stringify(postRows)}::jsonb) as r(id text, agent text, agent_id text, ts text, title text, snippet text, url text, board text, score integer, comments integer)
      where ${guard}
      on conflict (id) do nothing`] : []),
  ]);
  const stats: Record<string, unknown> = {
    pages, fetched, counted, stored: postRows.length, reached, boundary: new Date(boundary).toISOString(), countedThrough: next.countedThrough,
    daysUpdated: dailyRows.length, cappedDays: cappedNow,
  };
  if (!committed) return { outcome: "partial", stats: { ...stats, reason: "coverage checkpoint superseded" } };
  return { stats, partial: !reached, outcome: reached ? "success" : "partial" };
};
