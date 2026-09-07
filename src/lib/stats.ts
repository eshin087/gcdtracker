import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import {
  forumDaily,
  forumPosts,
  githubDaily,
  githubEvents,
  guestbookNotes,
  ingestRuns,
  watchedPrs,
  wikiDaily,
  wikiEdits,
} from "@/lib/db/schema";
import { cacheSummary } from "./query-cache";
import { sourceHealth, sensorStatus } from "./health";
import { dayRange, daysAgo, dayOf } from "@/lib/format";
import type { LiveInfo } from "@/lib/live-types";
import { publicGuestbookNote, guestbookEvidenceColumns, type PublicGuestbookNote } from "@/lib/public-evidence";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (d: Date | string | null | undefined): string | null => {
  if (d === null || d === undefined) return null;
  const date = typeof d === "string" ? new Date(d.includes("T") ? d : d.replace(" ", "T").replace(/\+00(:00)?$/, "Z")) : d;
  return Number.isNaN(date.getTime()) ? String(d) : date.toISOString();
};

/** Missing configuration renders an offline state; query failures surface as unavailable. */
async function safe<T>(fallback: T, fn: (d: Db) => Promise<T>): Promise<T> {
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch (err) {
    console.error("stats query failed", err);
    throw new Error("Data temporarily unavailable", { cause: err });
  }
}

export const hasDatabase = (): boolean => db !== null;

/* ------------------------------------------------------------------ */
/* wikipedia                                                          */
/* ------------------------------------------------------------------ */

export interface WikiDay {
  day: string;
  total: number | null;
  bot: number | null;
  tier1: number;
  tier2: number;
}

export async function getWikiByDay(days = 60, wiki = "en"): Promise<WikiDay[]> {
  const since = daysAgo(days - 1);
  const out = new Map<string, WikiDay>();
  for (const day of dayRange(since, dayOf())) out.set(day, { day, total: null, bot: null, tier1: 0, tier2: 0 });
  const totals = await safe([] as Array<{ day: string; total: number | null; bot: number | null }>, async (d) =>
    d
      .select({ day: wikiDaily.day, total: wikiDaily.total, bot: wikiDaily.bot })
      .from(wikiDaily)
      .where(and(eq(wikiDaily.wiki, wiki), gte(wikiDaily.day, since))),
  );
  for (const t of totals) {
    const row = out.get(t.day);
    if (row) {
      row.total = t.total;
      row.bot = t.bot;
    }
  }
  const flagged = await safe([] as Array<{ day: unknown; tier: number; c: unknown }>, async (d) =>
    d
      .select({ day: sql`(${wikiEdits.ts} at time zone 'UTC')::date`, tier: wikiEdits.tier, c: count() })
      .from(wikiEdits)
      .where(and(eq(wikiEdits.wiki, wiki), gte(wikiEdits.ts, new Date(`${since}T00:00:00Z`))))
      .groupBy(sql`(${wikiEdits.ts} at time zone 'UTC')::date`, wikiEdits.tier),
  );
  for (const f of flagged) {
    const day = String(f.day).slice(0, 10);
    const row = out.get(day);
    if (!row) continue;
    if (f.tier === 1) row.tier1 += n(f.c);
    else row.tier2 += n(f.c);
  }
  return [...out.values()];
}

export type WikiEditRow = typeof wikiEdits.$inferSelect;

export async function getWikiEdits(opts: { tier?: 1 | 2; page?: number; perPage?: number; wiki?: string } = {}): Promise<{
  rows: WikiEditRow[];
  total: number;
  page: number;
  pages: number;
}> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, Math.max(10, opts.perPage ?? 50));
  const wiki = opts.wiki ?? "en";
  const conds = [eq(wikiEdits.wiki, wiki)];
  if (opts.tier) conds.push(eq(wikiEdits.tier, opts.tier));
  return safe({ rows: [] as WikiEditRow[], total: 0, page, pages: 1 }, async (d) => {
    const [{ total }] = await d.select({ total: count() }).from(wikiEdits).where(and(...conds));
    const rows = await d
      .select()
      .from(wikiEdits)
      .where(and(...conds))
      .orderBy(desc(wikiEdits.ts))
      .limit(perPage)
      .offset((page - 1) * perPage);
    return { rows, total: n(total), page, pages: Math.max(1, Math.ceil(n(total) / perPage)) };
  });
}

export interface WikiEditor {
  user: string;
  edits: number;
  tier1: number;
  tier2: number;
  lastSeen: string | null;
}

export async function getWikiEditors(days = 30, wiki = "en", limit = 100): Promise<WikiEditor[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await safe([] as Array<{ user: string; edits: unknown; tier1: unknown; tier2: unknown; lastSeen: Date | null }>, async (d) =>
    d
      .select({
        user: wikiEdits.user,
        edits: count(),
        tier1: sql`count(*) filter (where ${wikiEdits.tier} = 1)`,
        tier2: sql`count(*) filter (where ${wikiEdits.tier} = 2)`,
        lastSeen: sql<Date | null>`max(${wikiEdits.ts})`,
      })
      .from(wikiEdits)
      .where(and(eq(wikiEdits.wiki, wiki), gte(wikiEdits.ts, since)))
      .groupBy(wikiEdits.user)
      .orderBy(desc(count()))
      .limit(limit),
  );
  return rows.map((r) => ({ user: r.user, edits: n(r.edits), tier1: n(r.tier1), tier2: n(r.tier2), lastSeen: iso(r.lastSeen) }));
}

/* ------------------------------------------------------------------ */
/* github                                                             */
/* ------------------------------------------------------------------ */

export interface GithubDay {
  day: string;
  botAccounts: number;
  branchPrefix: number;
  byAgent: Record<string, number>;
}

export async function getGithubByDay(days = 60): Promise<GithubDay[]> {
  const since = daysAgo(days - 1);
  const out = new Map<string, GithubDay>();
  for (const day of dayRange(since, dayOf())) out.set(day, { day, botAccounts: 0, branchPrefix: 0, byAgent: {} });
  const rows = await safe([] as Array<{ day: string; agent: string; prs: number; tier: string }>, async (d) =>
    d
      .select({ day: githubDaily.day, agent: githubDaily.agent, prs: githubDaily.prs, tier: githubDaily.tier })
      .from(githubDaily)
      .where(gte(githubDaily.day, since)),
  );
  for (const r of rows) {
    const row = out.get(r.day);
    if (!row) continue;
    row.byAgent[r.agent] = n(r.prs);
    if (r.tier === "branch-prefix") row.branchPrefix += n(r.prs);
    else row.botAccounts += n(r.prs);
  }
  return [...out.values()];
}

export interface GithubAgentRow {
  agent: string;
  tier: string;
  prs: number;
  days: number;
  lastDay: string | null;
}

export async function getGithubByAgent(days = 30): Promise<GithubAgentRow[]> {
  const since = daysAgo(days - 1);
  const rows = await safe([] as Array<{ agent: string; tier: string; prs: unknown; days: unknown; lastDay: string | null }>, async (d) =>
    d
      .select({
        agent: githubDaily.agent,
        tier: githubDaily.tier,
        prs: sql`sum(${githubDaily.prs})`,
        days: count(),
        lastDay: sql<string | null>`max(${githubDaily.day})`,
      })
      .from(githubDaily)
      .where(gte(githubDaily.day, since))
      .groupBy(githubDaily.agent, githubDaily.tier)
      .orderBy(desc(sql`sum(${githubDaily.prs})`)),
  );
  return rows.map((r) => ({ agent: r.agent, tier: r.tier, prs: n(r.prs), days: n(r.days), lastDay: r.lastDay }));
}

export type GithubEventRow = typeof githubEvents.$inferSelect;

export async function getGithubEvents(limit = 50, agent?: string): Promise<GithubEventRow[]> {
  return safe([] as GithubEventRow[], async (d) =>
    d
      .select()
      .from(githubEvents)
      .where(agent ? eq(githubEvents.agent, agent) : undefined)
      .orderBy(desc(githubEvents.createdAt))
      .limit(limit),
  );
}

/* ------------------------------------------------------------------ */
/* forums + guestbook                                                 */
/* ------------------------------------------------------------------ */

export interface ForumDay {
  day: string;
  posts: number;
  agents: number;
}

export async function getForumByDay(days = 60): Promise<ForumDay[]> {
  const since = daysAgo(days - 1);
  const rows = await safe([] as Array<{ day: string; posts: number; agents: number }>, async (d) =>
    d.select().from(forumDaily).where(gte(forumDaily.day, since)),
  );
  const map = new Map(rows.map((r) => [r.day, r]));
  return dayRange(since, dayOf()).map((day) => ({ day, posts: n(map.get(day)?.posts), agents: n(map.get(day)?.agents) }));
}

export type ForumPostRow = typeof forumPosts.$inferSelect;

export async function getForumPosts(limit = 50): Promise<ForumPostRow[]> {
  return safe([] as ForumPostRow[], async (d) => d.select().from(forumPosts).orderBy(desc(forumPosts.ts)).limit(limit));
}

export type GuestbookRow = PublicGuestbookNote;

export async function getGuestbook(limit = 20): Promise<GuestbookRow[]> {
  return safe([] as GuestbookRow[], async (d) => {
    const rows = await d.select(guestbookEvidenceColumns).from(guestbookNotes).where(eq(guestbookNotes.hidden, false)).orderBy(desc(guestbookNotes.ts)).limit(limit);
    return rows.map(publicGuestbookNote);
  });
}

/* ------------------------------------------------------------------ */
/* ingest status, live, overview                                      */
/* ------------------------------------------------------------------ */

export type IngestRunRow = typeof ingestRuns.$inferSelect;

async function queryIngestStatus(): Promise<IngestRunRow[]> {
  return safe([] as IngestRunRow[], async (d) => {
    const rows = await d.selectDistinctOn([ingestRuns.source]).from(ingestRuns).orderBy(ingestRuns.source, desc(ingestRuns.startedAt));
    const seen = new Set<string>();
    const latest: IngestRunRow[] = [];
    for (const r of rows) {
      if (seen.has(r.source)) continue;
      seen.add(r.source);
      latest.push(r);
    }
    return latest.sort((a, b) => a.source.localeCompare(b.source));
  });
}

export async function getLive(): Promise<LiveInfo> {
  const generatedAt = new Date().toISOString();
  const fallback: LiveInfo = { db: false, status: "offline", sources: [], lastIngest: null, generatedAt };
  if (!db) return fallback;
  return safe(fallback, async (d) => {
    const [r] = await d.select({ last: sql<Date | null>`max(${ingestRuns.finishedAt})` }).from(ingestRuns).where(eq(ingestRuns.ok, true));
    const sources = (await queryIngestStatus()).filter((run) => run.finishedAt !== null).map((run) => sourceHealth({ ...run, finishedAt: run.finishedAt! }));
    return { db: true, status: sensorStatus(sources), sources, lastIngest: iso(r?.last), generatedAt };
  }).catch(() => fallback);
}



export interface Overview {
  db: boolean;
  windowStart: string;
  windowEnd: string;
  wikiFlagged7d: number;
  wikiFlaggedTotal: number;
  agentPrs7d: number;
  codexPrs7d: number;
  forumPosts7d: number;
}
export const EMPTY_OVERVIEW: Overview = {
  db: false, windowStart: "", windowEnd: "", wikiFlagged7d: 0, wikiFlaggedTotal: 0,
  agentPrs7d: 0, codexPrs7d: 0, forumPosts7d: 0,
};
async function queryOverview(): Promise<Overview> {
  return safe(EMPTY_OVERVIEW, async (d) => {
    const week = daysAgo(7), today = dayOf();
    const weekTs = new Date(week + "T00:00:00Z"), todayTs = new Date(today + "T00:00:00Z");
    const [[w], [g], [f]] = await d.batch([
      d.select({ total: count(), week: sql`count(*) filter (where ${wikiEdits.ts} >= ${weekTs} and ${wikiEdits.ts} < ${todayTs})` }).from(wikiEdits),
      d.select({
        bots: sql`coalesce(sum(${githubDaily.prs}) filter (where ${githubDaily.tier} = 'bot-account'), 0)`,
        codex: sql`coalesce(sum(${githubDaily.prs}) filter (where ${githubDaily.agent} = 'codex-branch'), 0)`,
      }).from(githubDaily).where(and(gte(githubDaily.day, week), lt(githubDaily.day, today))),
      d.select({ posts: sql`coalesce(sum(${forumDaily.posts}), 0)` }).from(forumDaily).where(and(gte(forumDaily.day, week), lt(forumDaily.day, today))),
    ]);
    return { db: true, windowStart: week, windowEnd: today, wikiFlagged7d: n(w?.week),
      wikiFlaggedTotal: n(w?.total), agentPrs7d: n(g?.bots), codexPrs7d: n(g?.codex), forumPosts7d: n(f?.posts) };
  });
}

const cachedIngestStatus = cacheSummary(queryIngestStatus, "ingest-status");
export async function getIngestStatus(): Promise<IngestRunRow[]> {
  // Next data-cache serialization converts Date fields to ISO strings.
  const rows = await cachedIngestStatus();
  return rows.map((row) => ({ ...row, startedAt: new Date(row.startedAt), finishedAt: row.finishedAt ? new Date(row.finishedAt) : null }));
}
export const getOverview = cacheSummary(queryOverview, "research-overview-v1");

export interface TableCounts {
  wikiEdits: number;
  githubDaily: number;
  githubEvents: number;
  forumPosts: number;
  ipRanges: number;
  watched: number;
}

export async function getTableCounts(): Promise<TableCounts> {
  const empty: TableCounts = { wikiEdits: 0, githubDaily: 0, githubEvents: 0, forumPosts: 0, ipRanges: 0, watched: 0 };
  return safe(empty, async (d) => {
    const { ipRanges } = await import("@/lib/db/schema");
    const rows = await d.batch([
      d.select({ c: count() }).from(wikiEdits),
      d.select({ c: count() }).from(githubDaily),
      d.select({ c: count() }).from(githubEvents),
      d.select({ c: count() }).from(forumPosts),
      d.select({ c: count() }).from(ipRanges),
      d.select({ c: count() }).from(watchedPrs),
    ]);
    return Object.fromEntries(Object.keys(empty).map((key, i) => [key, n(rows[i][0]?.c)])) as unknown as TableCounts;
  });
}
