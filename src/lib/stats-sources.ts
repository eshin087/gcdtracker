import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { AI_CATEGORIES } from "@/lib/agents/types";
import { db, type Db } from "@/lib/db";
import {
  agentSightings,
  commonsAiUploads,
  externalSeries,
  forumPosts,
  githubDaily,
  ingestRuns,
  mcpServers,
  osmChangesets,
  osmDaily,
  visits,
  watchedPrs,
  watchedRepos,
  watchedSignals,
  wikiDaily,
  wikidataBotEdits,
  wikiEdits,
  wikiTagWatch,
} from "@/lib/db/schema";
import { dayOf, dayRange, daysAgo } from "@/lib/format";
import { githubAgentLabel } from "@/lib/github/agents";

const AI = [...AI_CATEGORIES] as string[];
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (d: Date | string | null | undefined): string | null => {
  if (d === null || d === undefined) return null;
  const date = typeof d === "string" ? new Date(d.includes("T") ? d : d.replace(" ", "T").replace(/\+00(:00)?$/, "Z")) : d;
  return Number.isNaN(date.getTime()) ? String(d) : date.toISOString();
};
const dayCol = (col: unknown) => sql`(${col} at time zone 'UTC')::date`;

async function safe<T>(fallback: T, fn: (d: Db) => Promise<T>): Promise<T> {
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch (err) {
    console.error("stats-sources query failed", err);
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* watched repositories                                               */
/* ------------------------------------------------------------------ */

export interface WatchedSummary {
  total: number;
  last7d: number;
  last30d: number;
  documented30d: number;
  selfDisclosed30d: number;
  byAgent: Array<{ agentId: string; count90d: number; lastActivity: string | null }>;
  repos: Array<{ repository: string; source: string; count30d: number; lastActivity: string | null; lastPolled: string | null }>;
  signals: Record<string, number>;
  lastIngest: string | null;
}

export const EMPTY_WATCHED: WatchedSummary = {
  total: 0, last7d: 0, last30d: 0, documented30d: 0, selfDisclosed30d: 0, byAgent: [], repos: [], signals: {}, lastIngest: null,
};

export async function getWatchedSummary(): Promise<WatchedSummary> {
  return safe(EMPTY_WATCHED, async (d) => {
    const week = new Date(Date.now() - 7 * 86_400_000);
    const month = new Date(Date.now() - 30 * 86_400_000);
    const quarter = new Date(Date.now() - 90 * 86_400_000);
    const [t] = await d
      .select({
        total: count(),
        week: sql`count(*) filter (where ${watchedPrs.createdAt} >= ${week})`,
        month: sql`count(*) filter (where ${watchedPrs.createdAt} >= ${month})`,
        documented: sql`count(*) filter (where ${watchedPrs.createdAt} >= ${month} and ${watchedPrs.attribution} = 'documented_agent')`,
        self: sql`count(*) filter (where ${watchedPrs.createdAt} >= ${month} and ${watchedPrs.attribution} = 'self_disclosed')`,
      })
      .from(watchedPrs);
    const byAgent = await d
      .select({ agentId: watchedPrs.agentId, c: count(), last: sql<Date | null>`max(${watchedPrs.createdAt})` })
      .from(watchedPrs)
      .where(gte(watchedPrs.createdAt, quarter))
      .groupBy(watchedPrs.agentId)
      .orderBy(desc(count()));
    const repos = await d.select().from(watchedRepos).orderBy(desc(watchedRepos.prCount30d));
    const sig = await d.select({ status: watchedSignals.status, c: count() }).from(watchedSignals).groupBy(watchedSignals.status);
    const [run] = await d
      .select({ finishedAt: ingestRuns.finishedAt })
      .from(ingestRuns)
      .where(and(eq(ingestRuns.source, "watched"), eq(ingestRuns.ok, true)))
      .orderBy(desc(ingestRuns.startedAt))
      .limit(1);
    return {
      total: n(t?.total),
      last7d: n(t?.week),
      last30d: n(t?.month),
      documented30d: n(t?.documented),
      selfDisclosed30d: n(t?.self),
      byAgent: byAgent.map((r) => ({ agentId: r.agentId ?? "self-disclosed", count90d: n(r.c), lastActivity: iso(r.last) })),
      repos: repos.map((r) => ({ repository: r.repo, source: r.source, count30d: r.prCount30d, lastActivity: iso(r.lastPrAt), lastPolled: iso(r.lastPolledAt) })),
      signals: Object.fromEntries(sig.map((s) => [s.status, n(s.c)])),
      lastIngest: iso(run?.finishedAt),
    };
  });
}

export interface WatchedDay {
  day: string;
  total: number;
  byAgent: Record<string, number>;
}

export async function getWatchedByDay(days = 60): Promise<WatchedDay[]> {
  const since = daysAgo(days - 1);
  const out = new Map<string, WatchedDay>();
  for (const day of dayRange(since, dayOf())) out.set(day, { day, total: 0, byAgent: {} });
  const rows = await safe([] as Array<{ day: unknown; agentId: string | null; c: unknown }>, async (d) =>
    d
      .select({ day: dayCol(watchedPrs.createdAt), agentId: watchedPrs.agentId, c: count() })
      .from(watchedPrs)
      .where(gte(watchedPrs.createdAt, new Date(`${since}T00:00:00Z`)))
      .groupBy(dayCol(watchedPrs.createdAt), watchedPrs.agentId),
  );
  for (const r of rows) {
    const row = out.get(String(r.day).slice(0, 10));
    if (!row) continue;
    row.total += n(r.c);
    row.byAgent[r.agentId ?? "self-disclosed"] = n(r.c);
  }
  return [...out.values()];
}

export type WatchedPrRow = typeof watchedPrs.$inferSelect;
export type WatchedSignalRow = typeof watchedSignals.$inferSelect;

export async function getWatchedRecent(limit = 40): Promise<WatchedPrRow[]> {
  return safe([] as WatchedPrRow[], async (d) => d.select().from(watchedPrs).orderBy(desc(watchedPrs.createdAt)).limit(limit));
}

export async function getWatchedSignals(status?: string, limit = 100): Promise<Array<WatchedSignalRow & { title: string | null; repository: string | null }>> {
  return safe([] as Array<WatchedSignalRow & { title: string | null; repository: string | null }>, async (d) => {
    const rows = await d
      .select({ s: watchedSignals, title: watchedPrs.title, repository: watchedPrs.repository })
      .from(watchedSignals)
      .leftJoin(watchedPrs, eq(watchedPrs.id, watchedSignals.activityId))
      .where(status ? eq(watchedSignals.status, status) : undefined)
      .orderBy(desc(watchedSignals.updatedAt))
      .limit(limit);
    return rows.map((r) => ({ ...r.s, title: r.title, repository: r.repository }));
  });
}

/* ------------------------------------------------------------------ */
/* wikimedia-wide                                                     */
/* ------------------------------------------------------------------ */

export interface ProjectDay {
  wiki: string;
  day: string;
  total: number | null;
  bot: number | null;
}

/** Latest available day per project plus a 14-day series. */
export async function getWikimediaProjects(days = 14): Promise<Record<string, ProjectDay[]>> {
  const since = daysAgo(days + 3);
  const rows = await safe([] as ProjectDay[], async (d) =>
    d.select({ wiki: wikiDaily.wiki, day: wikiDaily.day, total: wikiDaily.total, bot: wikiDaily.bot }).from(wikiDaily).where(gte(wikiDaily.day, since)).orderBy(wikiDaily.day),
  );
  const out: Record<string, ProjectDay[]> = {};
  for (const r of rows) (out[r.wiki] ??= []).push(r);
  return out;
}

export type WikidataEditRow = typeof wikidataBotEdits.$inferSelect;
export type CommonsRow = typeof commonsAiUploads.$inferSelect;

export async function getWikidataBotEdits(limit = 30): Promise<{ rows: WikidataEditRow[]; last30d: number }> {
  return safe({ rows: [] as WikidataEditRow[], last30d: 0 }, async (d) => {
    const rows = await d.select().from(wikidataBotEdits).orderBy(desc(wikidataBotEdits.ts)).limit(limit);
    const [c] = await d.select({ c: count() }).from(wikidataBotEdits).where(gte(wikidataBotEdits.ts, new Date(Date.now() - 30 * 86_400_000)));
    return { rows, last30d: n(c?.c) };
  });
}

export async function getCommonsUploads(limit = 30): Promise<{ rows: CommonsRow[]; last30d: number; byDay: Array<{ day: string; c: number }> }> {
  return safe({ rows: [] as CommonsRow[], last30d: 0, byDay: [] as Array<{ day: string; c: number }> }, async (d) => {
    const rows = await d.select().from(commonsAiUploads).orderBy(desc(commonsAiUploads.ts)).limit(limit);
    const since = daysAgo(59);
    const per = await d
      .select({ day: dayCol(commonsAiUploads.ts), c: count() })
      .from(commonsAiUploads)
      .where(gte(commonsAiUploads.ts, new Date(`${since}T00:00:00Z`)))
      .groupBy(dayCol(commonsAiUploads.ts));
    const map = new Map(per.map((p) => [String(p.day).slice(0, 10), n(p.c)]));
    const byDay = dayRange(since, dayOf()).map((day) => ({ day, c: map.get(day) ?? 0 }));
    const [c] = await d.select({ c: count() }).from(commonsAiUploads).where(gte(commonsAiUploads.ts, new Date(Date.now() - 30 * 86_400_000)));
    return { rows, last30d: n(c?.c), byDay };
  });
}

export type TagWatchRow = typeof wikiTagWatch.$inferSelect;
export async function getTagWatch(): Promise<TagWatchRow[]> {
  return safe([] as TagWatchRow[], async (d) => d.select().from(wikiTagWatch).orderBy(desc(wikiTagWatch.hitcount)));
}

/* ------------------------------------------------------------------ */
/* OpenStreetMap                                                      */
/* ------------------------------------------------------------------ */

export interface OsmDay {
  day: string;
  sampled: number;
  ai: number;
}
export type OsmRow = typeof osmChangesets.$inferSelect;

export async function getOsmByDay(days = 60): Promise<OsmDay[]> {
  const since = daysAgo(days - 1);
  const rows = await safe([] as Array<{ day: string; sampled: number; aiAssisted: number }>, async (d) =>
    d.select({ day: osmDaily.day, sampled: osmDaily.sampled, aiAssisted: osmDaily.aiAssisted }).from(osmDaily).where(gte(osmDaily.day, since)),
  );
  const map = new Map(rows.map((r) => [r.day, r]));
  return dayRange(since, dayOf()).map((day) => ({ day, sampled: n(map.get(day)?.sampled), ai: n(map.get(day)?.aiAssisted) }));
}

export async function getOsmSummary(): Promise<{ ai7d: number; sampled7d: number; byEditor: Array<{ editor: string; c: number }>; byKind: Array<{ kind: string; c: number }>; recent: OsmRow[] }> {
  const empty = { ai7d: 0, sampled7d: 0, byEditor: [] as Array<{ editor: string; c: number }>, byKind: [] as Array<{ kind: string; c: number }>, recent: [] as OsmRow[] };
  return safe(empty, async (d) => {
    const week = daysAgo(6);
    const [t] = await d.select({ ai: sql`coalesce(sum(${osmDaily.aiAssisted}),0)`, sampled: sql`coalesce(sum(${osmDaily.sampled}),0)` }).from(osmDaily).where(gte(osmDaily.day, week));
    const since = new Date(Date.now() - 30 * 86_400_000);
    const byEditor = await d.select({ editor: osmChangesets.editor, c: count() }).from(osmChangesets).where(gte(osmChangesets.ts, since)).groupBy(osmChangesets.editor).orderBy(desc(count())).limit(12);
    const byKind = await d.select({ kind: osmChangesets.aiKind, c: count() }).from(osmChangesets).where(gte(osmChangesets.ts, since)).groupBy(osmChangesets.aiKind).orderBy(desc(count()));
    const recent = await d.select().from(osmChangesets).orderBy(desc(osmChangesets.ts)).limit(40);
    return { ai7d: n(t?.ai), sampled7d: n(t?.sampled), byEditor: byEditor.map((r) => ({ editor: r.editor ?? "unknown", c: n(r.c) })), byKind: byKind.map((r) => ({ kind: r.kind, c: n(r.c) })), recent };
  });
}

/* ------------------------------------------------------------------ */
/* tooling: MCP registry, botcommits, Hugging Face                    */
/* ------------------------------------------------------------------ */

export type McpRow = typeof mcpServers.$inferSelect;

export async function getMcpSummary(days = 60): Promise<{ total: number; new7d: number; byDay: Array<{ day: string; c: number }>; recent: McpRow[] }> {
  const empty = { total: 0, new7d: 0, byDay: [] as Array<{ day: string; c: number }>, recent: [] as McpRow[] };
  return safe(empty, async (d) => {
    const since = daysAgo(days - 1);
    const [t] = await d.select({ total: count(), week: sql`count(*) filter (where ${mcpServers.publishedAt} >= ${new Date(Date.now() - 7 * 86_400_000)})` }).from(mcpServers);
    const per = await d
      .select({ day: dayCol(mcpServers.publishedAt), c: count() })
      .from(mcpServers)
      .where(gte(mcpServers.publishedAt, new Date(`${since}T00:00:00Z`)))
      .groupBy(dayCol(mcpServers.publishedAt));
    const map = new Map(per.map((p) => [String(p.day).slice(0, 10), n(p.c)]));
    const recent = await d.select().from(mcpServers).orderBy(desc(mcpServers.publishedAt)).limit(30);
    return { total: n(t?.total), new7d: n(t?.week), byDay: dayRange(since, dayOf()).map((day) => ({ day, c: map.get(day) ?? 0 })), recent };
  });
}

export interface SeriesPoint {
  period: string;
  value: number;
  lo: number | null;
  hi: number | null;
}

/** All series for a source, keyed by series name, sorted by period. */
export async function getSeries(source: string): Promise<Record<string, SeriesPoint[]>> {
  const rows = await safe([] as Array<{ series: string; period: string; value: number; lo: number | null; hi: number | null }>, async (d) =>
    d.select({ series: externalSeries.series, period: externalSeries.period, value: externalSeries.value, lo: externalSeries.lo, hi: externalSeries.hi }).from(externalSeries).where(eq(externalSeries.source, source)).orderBy(externalSeries.period),
  );
  const out: Record<string, SeriesPoint[]> = {};
  for (const r of rows) (out[r.series] ??= []).push({ period: r.period, value: Number(r.value), lo: r.lo, hi: r.hi });
  return out;
}

/* ------------------------------------------------------------------ */
/* new agents                                                         */
/* ------------------------------------------------------------------ */

export type SightingRow = typeof agentSightings.$inferSelect;

export async function getSightings(limit = 100): Promise<{ rows: SightingRow[]; counts: Record<string, number>; new30d: number }> {
  return safe({ rows: [] as SightingRow[], counts: {} as Record<string, number>, new30d: 0 }, async (d) => {
    const rows = await d.select().from(agentSightings).orderBy(desc(agentSightings.firstSeen)).limit(limit);
    const counts = await d.select({ kind: agentSightings.kind, c: count() }).from(agentSightings).groupBy(agentSightings.kind);
    const [nw] = await d.select({ c: count() }).from(agentSightings).where(gte(agentSightings.firstSeen, new Date(Date.now() - 30 * 86_400_000)));
    return { rows, counts: Object.fromEntries(counts.map((c) => [c.kind, n(c.c)])), new30d: n(nw?.c) };
  });
}

/* ------------------------------------------------------------------ */
/* flow animation + latest records                                    */
/* ------------------------------------------------------------------ */

export interface FlowNode {
  id: string;
  label: string;
  total: number;
  group?: string;
}
export interface FlowLink {
  source: string;
  target: string;
  value: number;
}
export interface FlowData {
  sources: FlowNode[];
  targets: FlowNode[];
  links: FlowLink[];
  days: number;
}

export const FLOW_TARGETS: FlowNode[] = [
  { id: "code", label: "Code repositories", total: 0 },
  { id: "wikis", label: "Encyclopedias & wikis", total: 0 },
  { id: "maps", label: "Maps", total: 0 },
  { id: "forums", label: "Forums", total: 0 },
  { id: "site", label: "This website", total: 0 },
];

/** 30-day counts of who acts where, for the home-page animation. */
export async function getFlowData(days = 30): Promise<FlowData> {
  const empty: FlowData = { sources: [], targets: FLOW_TARGETS.map((t) => ({ ...t })), links: [], days };
  return safe(empty, async (d) => {
    const since = new Date(Date.now() - days * 86_400_000);
    const sinceDay = daysAgo(days - 1);
    const links: FlowLink[] = [];
    const sources = new Map<string, FlowNode>();
    const add = (id: string, label: string, target: string, value: number, group?: string) => {
      if (value <= 0) return;
      const s = sources.get(id) ?? { id, label, total: 0, group };
      s.total += value;
      sources.set(id, s);
      links.push({ source: id, target, value });
    };

    // Coding agents → code repositories (bot-account search counts).
    const gh = await d
      .select({ agent: githubDaily.agent, prs: sql`sum(${githubDaily.prs})` })
      .from(githubDaily)
      .where(and(gte(githubDaily.day, sinceDay), inArray(githubDaily.tier, ["bot-account", "branch-prefix"])))
      .groupBy(githubDaily.agent)
      .orderBy(desc(sql`sum(${githubDaily.prs})`));
    let other = 0;
    gh.forEach((r, i) => {
      if (i < 6) add(`gh:${r.agent}`, githubAgentLabel(r.agent).replace(/ \(.*\)$/, ""), "code", n(r.prs), "coding");
      else other += n(r.prs);
    });
    add("gh:other", "Other coding agents", "code", other, "coding");

    // Crawlers and fetchers → this website.
    const v = await d
      .select({ category: visits.category, c: count() })
      .from(visits)
      .where(and(gte(visits.ts, since), inArray(visits.category, AI)))
      .groupBy(visits.category);
    const cat = Object.fromEntries(v.map((r) => [r.category, n(r.c)]));
    add("web:crawlers", "Training & search crawlers", "site", (cat["ai-training-crawler"] ?? 0) + (cat["ai-search-index"] ?? 0), "web");
    add("web:fetchers", "User-triggered fetchers", "site", cat["ai-user-fetch"] ?? 0, "web");
    add("web:agents", "Browsing & coding agents", "site", (cat["ai-browsing-agent"] ?? 0) + (cat["ai-coding-agent"] ?? 0) + (cat["ai-tooling"] ?? 0), "web");

    // Wikis.
    const [w] = await d.select({ c: count() }).from(wikiEdits).where(gte(wikiEdits.ts, since));
    add("wiki:flagged", "Flagged Wikipedia editors", "wikis", n(w?.c), "wiki");
    const [wd] = await d.select({ c: count() }).from(wikidataBotEdits).where(gte(wikidataBotEdits.ts, since));
    add("wiki:wikidata", "Wikidata bots", "wikis", n(wd?.c), "wiki");
    const [cm] = await d.select({ c: count() }).from(commonsAiUploads).where(gte(commonsAiUploads.ts, since));
    add("wiki:commons", "AI image uploaders", "wikis", n(cm?.c), "wiki");

    // Maps.
    const [o] = await d.select({ c: sql`coalesce(sum(${osmDaily.aiAssisted}),0)` }).from(osmDaily).where(gte(osmDaily.day, sinceDay));
    add("maps:ai", "AI-assisted map editors", "maps", n(o?.c), "maps");

    // Forums.
    const [f] = await d.select({ c: count() }).from(forumPosts).where(gte(forumPosts.ts, since));
    add("forum:agents", "Forum agents", "forums", n(f?.c), "forum");

    const targets = FLOW_TARGETS.map((t) => ({ ...t, total: links.filter((l) => l.target === t.id).reduce((a, l) => a + l.value, 0) }));
    return { sources: [...sources.values()], targets, links, days };
  });
}

export interface LatestRecord {
  id: string;
  kind: "visit" | "wiki" | "pr" | "forum" | "map" | "commons";
  actor: string;
  action: string;
  target: string;
  url: string | null;
  ts: string;
}

export async function getLatestRecords(limit = 12): Promise<LatestRecord[]> {
  return safe([] as LatestRecord[], async (d) => {
    const per = Math.max(3, Math.ceil(limit / 2));
    const [v, w, p, f, o, c] = await Promise.all([
      d.select().from(visits).where(inArray(visits.category, AI)).orderBy(desc(visits.ts)).limit(per),
      d.select().from(wikiEdits).orderBy(desc(wikiEdits.ts)).limit(per),
      d.select().from(watchedPrs).orderBy(desc(watchedPrs.createdAt)).limit(per),
      d.select().from(forumPosts).orderBy(desc(forumPosts.ts)).limit(per),
      d.select().from(osmChangesets).orderBy(desc(osmChangesets.ts)).limit(per),
      d.select().from(commonsAiUploads).orderBy(desc(commonsAiUploads.ts)).limit(per),
    ]);
    const out: LatestRecord[] = [
      ...v.map((r) => ({ id: `visit-${r.id}`, kind: "visit" as const, actor: r.agentName ?? r.agentSlug ?? "AI agent", action: "visited", target: `this site ${r.path}`, url: r.agentSlug ? `/agents/${encodeURIComponent(r.agentSlug)}` : null, ts: r.ts.toISOString() })),
      ...w.map((r) => ({ id: `wiki-${r.rcid}`, kind: "wiki" as const, actor: r.user, action: r.tier === 1 ? "made a filter-flagged edit to" : "made a possible AI edit to", target: r.title, url: r.url, ts: r.ts.toISOString() })),
      ...p.map((r) => ({ id: `pr-${r.id}`, kind: "pr" as const, actor: r.agentId ? githubAgentLabel(r.agentId) : (r.actorLogin ?? "someone"), action: r.attribution === "documented_agent" ? "opened a pull request in" : "disclosed AI help in", target: `${r.repository} · ${r.title}`, url: r.url, ts: r.createdAt.toISOString() })),
      ...f.map((r) => ({ id: `forum-${r.id}`, kind: "forum" as const, actor: r.agent, action: "posted", target: r.title, url: r.url, ts: r.ts.toISOString() })),
      ...o.map((r) => ({ id: `map-${r.id}`, kind: "map" as const, actor: r.user ?? r.editor ?? "map editor", action: `edited the map with ${r.editor ?? "an AI tool"}`, target: r.comment ?? `changeset ${r.id}`, url: r.url, ts: r.ts.toISOString() })),
      ...c.map((r) => ({ id: `commons-${r.pageid}`, kind: "commons" as const, actor: "Commons uploader", action: "added an AI-generated file", target: r.title, url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(r.title)}`, ts: r.ts.toISOString() })),
    ];
    return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
  });
}
