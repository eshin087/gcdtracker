import { and, count, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { findAgent } from "@/lib/agents/catalog";
import { AI_CATEGORIES, type Category } from "@/lib/agents/types";
import { db, type Db } from "@/lib/db";
import {
  forumDaily,
  forumPosts,
  githubDaily,
  githubEvents,
  guestbookNotes,
  ingestRuns,
  trafficDaily,
  visits,
  wikiDaily,
  wikiEdits,
} from "@/lib/db/schema";
import { dayRange, daysAgo, dayOf } from "@/lib/format";
import type { LiveInfo } from "@/lib/live-types";

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

const AI = [...AI_CATEGORIES] as string[];
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (d: Date | string | null | undefined): string | null =>
  d === null || d === undefined ? null : typeof d === "string" ? d : d.toISOString();

/** Run a query when the database exists; otherwise (or on error) return the fallback shape. */
async function safe<T>(fallback: T, fn: (d: Db) => Promise<T>): Promise<T> {
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch (err) {
    console.error("stats query failed", err);
    return fallback;
  }
}

export const hasDatabase = (): boolean => db !== null;

/* ------------------------------------------------------------------ */
/* traffic (this site)                                                */
/* ------------------------------------------------------------------ */

export interface TrafficDay {
  day: string;
  ai: number;
  searchEngine: number;
  otherBot: number;
  human: number;
  total: number;
}

export async function getTrafficByDay(days = 60): Promise<TrafficDay[]> {
  const since = daysAgo(days - 1);
  const rows = await safe([] as Array<{ day: string; category: string; count: number }>, async (d) =>
    d
      .select({ day: trafficDaily.day, category: trafficDaily.category, count: trafficDaily.count })
      .from(trafficDaily)
      .where(gte(trafficDaily.day, since)),
  );
  const byDay = new Map<string, TrafficDay>();
  for (const day of dayRange(since, dayOf())) {
    byDay.set(day, { day, ai: 0, searchEngine: 0, otherBot: 0, human: 0, total: 0 });
  }
  for (const r of rows) {
    const t = byDay.get(r.day);
    if (!t) continue;
    const c = n(r.count);
    if (AI.includes(r.category)) t.ai += c;
    else if (r.category === "search-engine") t.searchEngine += c;
    else if (r.category === "human") t.human += c;
    else t.otherBot += c;
    t.total += c;
  }
  return [...byDay.values()];
}

export interface CategoryCount {
  category: Category;
  count: number;
}

export async function getCategoryBreakdown(days = 30): Promise<CategoryCount[]> {
  const since = daysAgo(days - 1);
  const rows = await safe([] as Array<{ category: string; count: unknown }>, async (d) =>
    d
      .select({ category: trafficDaily.category, count: sql`sum(${trafficDaily.count})` })
      .from(trafficDaily)
      .where(gte(trafficDaily.day, since))
      .groupBy(trafficDaily.category),
  );
  return rows
    .map((r) => ({ category: r.category as Category, count: n(r.count) }))
    .sort((a, b) => b.count - a.count);
}

export interface AgentRow {
  slug: string;
  name: string;
  operator: string;
  category: Category;
  hits: number;
  verified: number;
  unverified: number;
  signed: number;
  lastSeen: string | null;
  firstSeen: string | null;
}

export async function getVisitsByAgent(days = 30, limit = 200): Promise<AgentRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await safe(
    [] as Array<{
      slug: string | null;
      name: string | null;
      operator: string | null;
      category: string;
      hits: unknown;
      verified: unknown;
      unverified: unknown;
      signed: unknown;
      lastSeen: Date | null;
      firstSeen: Date | null;
    }>,
    async (d) =>
      d
        .select({
          slug: visits.agentSlug,
          name: sql<string | null>`max(${visits.agentName})`,
          operator: sql<string | null>`max(${visits.operator})`,
          category: visits.category,
          hits: count(),
          verified: sql`count(*) filter (where ${visits.verified} = true)`,
          unverified: sql`count(*) filter (where ${visits.verified} = false)`,
          signed: sql`count(*) filter (where ${visits.signed} = true)`,
          lastSeen: sql<Date | null>`max(${visits.ts})`,
          firstSeen: sql<Date | null>`min(${visits.ts})`,
        })
        .from(visits)
        .where(and(gte(visits.ts, since), isNotNull(visits.agentSlug), inArray(visits.category, AI)))
        .groupBy(visits.agentSlug, visits.category)
        .orderBy(desc(count()))
        .limit(limit),
  );
  return rows.map((r) => ({
    slug: r.slug ?? "unknown",
    name: r.name ?? findAgent(r.slug ?? "")?.name ?? r.slug ?? "unknown",
    operator: r.operator ?? "",
    category: r.category as Category,
    hits: n(r.hits),
    verified: n(r.verified),
    unverified: n(r.unverified),
    signed: n(r.signed),
    lastSeen: iso(r.lastSeen),
    firstSeen: iso(r.firstSeen),
  }));
}

export type VisitRow = typeof visits.$inferSelect;

export async function getRecentVisits(limit = 50, opts: { slug?: string; trapOnly?: boolean } = {}): Promise<VisitRow[]> {
  return safe([] as VisitRow[], async (d) => {
    const conds = [];
    if (opts.slug) conds.push(eq(visits.agentSlug, opts.slug));
    if (opts.trapOnly) conds.push(eq(visits.robotsViolation, true));
    if (!opts.slug && !opts.trapOnly) conds.push(inArray(visits.category, AI));
    return d
      .select()
      .from(visits)
      .where(and(...conds))
      .orderBy(desc(visits.ts))
      .limit(limit);
  });
}

export interface ViolationRow {
  slug: string | null;
  name: string;
  category: Category;
  token: string | null;
  hits: number;
  lastSeen: string | null;
}

export async function getRobotsViolations(days = 90): Promise<ViolationRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await safe(
    [] as Array<{ slug: string | null; name: string | null; category: string; token: string | null; hits: unknown; lastSeen: Date | null }>,
    async (d) =>
      d
        .select({
          slug: visits.agentSlug,
          name: sql<string | null>`max(coalesce(${visits.agentName}, ${visits.ua}))`,
          category: visits.category,
          token: visits.trapToken,
          hits: count(),
          lastSeen: sql<Date | null>`max(${visits.ts})`,
        })
        .from(visits)
        .where(and(eq(visits.robotsViolation, true), gte(visits.ts, since)))
        .groupBy(visits.agentSlug, visits.category, visits.trapToken)
        .orderBy(desc(count()))
        .limit(100),
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name ?? "unknown",
    category: r.category as Category,
    token: r.token,
    hits: n(r.hits),
    lastSeen: iso(r.lastSeen),
  }));
}

export interface AgentDetail {
  hits: number;
  verified: number;
  unverified: number;
  signed: number;
  violations: number;
  firstSeen: string | null;
  lastSeen: string | null;
  byDay: Array<{ day: string; hits: number }>;
  topPaths: Array<{ path: string; hits: number }>;
  countries: Array<{ country: string; hits: number }>;
}

export const EMPTY_AGENT_DETAIL: AgentDetail = {
  hits: 0, verified: 0, unverified: 0, signed: 0, violations: 0,
  firstSeen: null, lastSeen: null, byDay: [], topPaths: [], countries: [],
};

export async function getAgentDetail(slug: string, days = 60): Promise<AgentDetail> {
  const since = daysAgo(days - 1);
  return safe(EMPTY_AGENT_DETAIL, async (d) => {
    const [totals] = await d
      .select({
        hits: count(),
        verified: sql`count(*) filter (where ${visits.verified} = true)`,
        unverified: sql`count(*) filter (where ${visits.verified} = false)`,
        signed: sql`count(*) filter (where ${visits.signed} = true)`,
        violations: sql`count(*) filter (where ${visits.robotsViolation} = true)`,
        firstSeen: sql<Date | null>`min(${visits.ts})`,
        lastSeen: sql<Date | null>`max(${visits.ts})`,
      })
      .from(visits)
      .where(eq(visits.agentSlug, slug));
    const byDayRows = await d
      .select({ day: visits.day, hits: count() })
      .from(visits)
      .where(and(eq(visits.agentSlug, slug), gte(visits.day, since)))
      .groupBy(visits.day);
    const byDayMap = new Map(byDayRows.map((r) => [r.day, n(r.hits)]));
    const byDay = dayRange(since, dayOf()).map((day) => ({ day, hits: byDayMap.get(day) ?? 0 }));
    const topPaths = await d
      .select({ path: visits.path, hits: count() })
      .from(visits)
      .where(eq(visits.agentSlug, slug))
      .groupBy(visits.path)
      .orderBy(desc(count()))
      .limit(10);
    const countries = await d
      .select({ country: visits.country, hits: count() })
      .from(visits)
      .where(and(eq(visits.agentSlug, slug), isNotNull(visits.country)))
      .groupBy(visits.country)
      .orderBy(desc(count()))
      .limit(8);
    return {
      hits: n(totals?.hits),
      verified: n(totals?.verified),
      unverified: n(totals?.unverified),
      signed: n(totals?.signed),
      violations: n(totals?.violations),
      firstSeen: iso(totals?.firstSeen),
      lastSeen: iso(totals?.lastSeen),
      byDay,
      topPaths: topPaths.map((p) => ({ path: p.path, hits: n(p.hits) })),
      countries: countries.map((c) => ({ country: c.country ?? "??", hits: n(c.hits) })),
    };
  });
}

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

export type GuestbookRow = typeof guestbookNotes.$inferSelect;

export async function getGuestbook(limit = 20): Promise<GuestbookRow[]> {
  return safe([] as GuestbookRow[], async (d) =>
    d.select().from(guestbookNotes).where(eq(guestbookNotes.hidden, false)).orderBy(desc(guestbookNotes.ts)).limit(limit),
  );
}

/* ------------------------------------------------------------------ */
/* ingest status, live, overview                                      */
/* ------------------------------------------------------------------ */

export type IngestRunRow = typeof ingestRuns.$inferSelect;

export async function getIngestStatus(): Promise<IngestRunRow[]> {
  return safe([] as IngestRunRow[], async (d) => {
    const rows = await d.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(60);
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
  const fallback: LiveInfo = { db: false, lastAiVisit: null, lastIngest: null, aiVisits24h: 0, generatedAt };
  if (!db) return fallback;
  return safe(fallback, async (d) => {
    const since = new Date(Date.now() - 86_400_000);
    const [v] = await d
      .select({ last: sql<Date | null>`max(${visits.ts})`, c24: sql`count(*) filter (where ${visits.ts} >= ${since})` })
      .from(visits)
      .where(inArray(visits.category, AI));
    const [r] = await d.select({ last: sql<Date | null>`max(${ingestRuns.finishedAt})` }).from(ingestRuns).where(eq(ingestRuns.ok, true));
    return { db: true, lastAiVisit: iso(v?.last), lastIngest: iso(r?.last), aiVisits24h: n(v?.c24), generatedAt };
  });
}

export interface Overview {
  db: boolean;
  sensorSince: string | null;
  aiVisitsTotal: number;
  aiVisits7d: number;
  requests7d: number;
  aiShare7d: number | null;
  distinctAgents30d: number;
  verifiedShare30d: number | null;
  violations: number;
  wikiFlagged7d: number;
  wikiFlaggedTotal: number;
  agentPrs7d: number;
  codexPrs7d: number;
  forumPosts7d: number;
  guestbookCount: number;
  lastAiVisit: string | null;
}

export const EMPTY_OVERVIEW: Overview = {
  db: false, sensorSince: null, aiVisitsTotal: 0, aiVisits7d: 0, requests7d: 0, aiShare7d: null,
  distinctAgents30d: 0, verifiedShare30d: null, violations: 0, wikiFlagged7d: 0, wikiFlaggedTotal: 0,
  agentPrs7d: 0, codexPrs7d: 0, forumPosts7d: 0, guestbookCount: 0, lastAiVisit: null,
};

export async function getOverview(): Promise<Overview> {
  if (!db) return EMPTY_OVERVIEW;
  return safe(EMPTY_OVERVIEW, async (d) => {
    const week = daysAgo(6);
    const weekTs = new Date(`${week}T00:00:00Z`);
    const month = new Date(Date.now() - 30 * 86_400_000);
    const [v] = await d
      .select({
        total: count(),
        first: sql<Date | null>`min(${visits.ts})`,
        last: sql<Date | null>`max(${visits.ts})`,
        week: sql`count(*) filter (where ${visits.ts} >= ${weekTs})`,
        violations: sql`count(*) filter (where ${visits.robotsViolation} = true)`,
      })
      .from(visits)
      .where(inArray(visits.category, AI));
    const [a] = await d
      .select({
        agents: sql`count(distinct ${visits.agentSlug})`,
        verified: sql`count(*) filter (where ${visits.verified} = true)`,
        decided: sql`count(*) filter (where ${visits.verified} is not null)`,
      })
      .from(visits)
      .where(and(inArray(visits.category, AI), gte(visits.ts, month)));
    const [t] = await d
      .select({
        all: sql`coalesce(sum(${trafficDaily.count}), 0)`,
        ai: sql`coalesce(sum(${trafficDaily.count}) filter (where ${trafficDaily.category} in (${sql.join(AI.map((c) => sql`${c}`), sql`, `)})), 0)`,
      })
      .from(trafficDaily)
      .where(gte(trafficDaily.day, week));
    const [w] = await d
      .select({ total: count(), week: sql`count(*) filter (where ${wikiEdits.ts} >= ${weekTs})` })
      .from(wikiEdits);
    const [g] = await d
      .select({
        bots: sql`coalesce(sum(${githubDaily.prs}) filter (where ${githubDaily.tier} = 'bot-account'), 0)`,
        codex: sql`coalesce(sum(${githubDaily.prs}) filter (where ${githubDaily.agent} = 'codex-branch'), 0)`,
      })
      .from(githubDaily)
      .where(and(gte(githubDaily.day, week), lt(githubDaily.day, dayOf())));
    const [f] = await d.select({ posts: sql`coalesce(sum(${forumDaily.posts}), 0)` }).from(forumDaily).where(gte(forumDaily.day, week));
    const [gb] = await d.select({ c: count() }).from(guestbookNotes).where(eq(guestbookNotes.hidden, false));
    const all = n(t?.all);
    const decided = n(a?.decided);
    return {
      db: true,
      sensorSince: iso(v?.first),
      aiVisitsTotal: n(v?.total),
      aiVisits7d: n(v?.week),
      requests7d: all,
      aiShare7d: all > 0 ? n(t?.ai) / all : null,
      distinctAgents30d: n(a?.agents),
      verifiedShare30d: decided > 0 ? n(a?.verified) / decided : null,
      violations: n(v?.violations),
      wikiFlagged7d: n(w?.week),
      wikiFlaggedTotal: n(w?.total),
      agentPrs7d: n(g?.bots),
      codexPrs7d: n(g?.codex),
      forumPosts7d: n(f?.posts),
      guestbookCount: n(gb?.c),
      lastAiVisit: iso(v?.last),
    };
  });
}

export interface TimelinePoint {
  day: string;
  aiVisits: number;
  wikiFlagged: number;
  agentPrs: number;
  forumPosts: number;
}

export async function getTimeline(days = 60): Promise<TimelinePoint[]> {
  const [traffic, wiki, gh, forum] = await Promise.all([
    getTrafficByDay(days),
    getWikiByDay(days),
    getGithubByDay(days),
    getForumByDay(days),
  ]);
  return traffic.map((t, i) => ({
    day: t.day,
    aiVisits: t.ai,
    wikiFlagged: (wiki[i]?.tier1 ?? 0) + (wiki[i]?.tier2 ?? 0),
    agentPrs: gh[i]?.botAccounts ?? 0,
    forumPosts: forum[i]?.posts ?? 0,
  }));
}

export interface TableCounts {
  visits: number;
  wikiEdits: number;
  githubDaily: number;
  githubEvents: number;
  forumPosts: number;
  guestbook: number;
  ipRanges: number;
}

export async function getTableCounts(): Promise<TableCounts> {
  const empty: TableCounts = { visits: 0, wikiEdits: 0, githubDaily: 0, githubEvents: 0, forumPosts: 0, guestbook: 0, ipRanges: 0 };
  return safe(empty, async (d) => {
    const one = async (q: Promise<Array<{ c: number }>>) => n((await q)[0]?.c);
    const { ipRanges } = await import("@/lib/db/schema");
    return {
      visits: await one(d.select({ c: count() }).from(visits)),
      wikiEdits: await one(d.select({ c: count() }).from(wikiEdits)),
      githubDaily: await one(d.select({ c: count() }).from(githubDaily)),
      githubEvents: await one(d.select({ c: count() }).from(githubEvents)),
      forumPosts: await one(d.select({ c: count() }).from(forumPosts)),
      guestbook: await one(d.select({ c: count() }).from(guestbookNotes).where(eq(guestbookNotes.hidden, false))),
      ipRanges: await one(d.select({ c: count() }).from(ipRanges)),
    };
  });
}
