import { inArray, sql } from "drizzle-orm";
import { forumDaily, forumPosts } from "@/lib/db/schema";
import { dayOf } from "@/lib/format";
import { fetchJson, type Job, timeLeft } from "./common";

const API = "https://www.moltbook.com/api/v1/posts";
const POST_URL = (id: string) => `https://www.moltbook.com/post/${id}`;

interface MoltPost {
  id: string;
  title: string;
  content?: string;
  author?: { id?: string; name?: string };
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

export function snippetOf(content: string | undefined): string | null {
  if (!content) return null;
  const s = content.replace(/\s+/g, " ").trim();
  return s.length > 280 ? `${s.slice(0, 277)}…` : s;
}

export const moltbookJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { fetched: 0, stored: 0, pages: 0 };
  let partial = false;
  let cursor: string | null = null;
  const minTs = Date.now() - 7 * 86_400_000;
  const touchedDays = new Set<string>();

  for (let page = 0; page < 10; page++) {
    if (timeLeft(ctx) < 10_000) {
      partial = true;
      break;
    }
    const qs: URLSearchParams = new URLSearchParams({ sort: "new", limit: "50", ...(cursor ? { cursor } : {}) });
    const res: { status: number; body: MoltResponse | null } = await fetchJson<MoltResponse>(`${API}?${qs}`);
    const { status, body } = res;
    if (status !== 200 || body?.success === false || !Array.isArray(body?.posts)) throw new Error(`moltbook ${status}: invalid or failed response`);
    stats.pages = (stats.pages as number) + 1;
    const posts = body.posts.filter((p) => p.id && p.created_at && !p.is_deleted && !p.is_spam);
    stats.fetched = (stats.fetched as number) + posts.length;
    if (posts.length === 0) {
      if (body.has_more) partial = true;
      break;
    }

    const ids = posts.map((p) => p.id);
    const existing = new Set(
      (await ctx.db.select({ id: forumPosts.id }).from(forumPosts).where(inArray(forumPosts.id, ids))).map((r) => r.id),
    );
    const fresh = posts.filter((p) => !existing.has(p.id));
    if (fresh.length > 0) {
      await ctx.db
        .insert(forumPosts)
        .values(
          fresh.map((p) => ({
            id: p.id,
            agent: (p.author?.name ?? "unknown").slice(0, 120),
            agentId: p.author?.id ?? null,
            ts: new Date(p.created_at),
            title: (p.title || "(untitled)").slice(0, 300),
            snippet: snippetOf(p.content),
            url: POST_URL(p.id),
            board: p.submolt?.name ?? null,
            score: p.score ?? null,
            comments: p.comment_count ?? null,
          })),
        )
        .onConflictDoNothing();
      stats.stored = (stats.stored as number) + fresh.length;
      for (const p of fresh) touchedDays.add(dayOf(new Date(p.created_at)));
    }

    const oldest = posts[posts.length - 1];
    // Stop once we hit posts we already had or posts older than a week.
    if (existing.size === posts.length || new Date(oldest.created_at).getTime() < minTs || !body.has_more) break;
    if (!body.next_cursor || body.next_cursor === cursor) throw new Error("moltbook continuation missing or repeated");
    cursor = body.next_cursor;
    if (page === 9) partial = true;
  }

  // Recompute daily counts for touched days plus today (cheap: GROUP BY over the last week).
  touchedDays.add(dayOf());
  const since = [...touchedDays].sort()[0];
  const rows = await ctx.db
    .select({
      day: sql<string>`(${forumPosts.ts} at time zone 'UTC')::date`,
      posts: sql<number>`count(*)`,
      agents: sql<number>`count(distinct ${forumPosts.agent})`,
    })
    .from(forumPosts)
    .where(sql`${forumPosts.ts} >= ${new Date(`${since}T00:00:00Z`)}`)
    .groupBy(sql`(${forumPosts.ts} at time zone 'UTC')::date`);
  for (const r of rows) {
    const day = String(r.day).slice(0, 10);
    await ctx.db
      .insert(forumDaily)
      .values({ day, posts: Number(r.posts), agents: Number(r.agents) })
      .onConflictDoUpdate({ target: forumDaily.day, set: { posts: sql`excluded.posts`, agents: sql`excluded.agents` } });
  }
  stats.daysUpdated = rows.length;
  return { stats, partial, outcome: partial ? "partial" : "success" };
};
