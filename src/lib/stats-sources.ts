import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { FLOW_TARGETS, type FlowData, type FlowSource, type FlowFeed, type FlowLink } from "./flow";
export { FLOW_TARGETS } from "./flow";
export type { FlowNode, FlowData, FlowLink } from "./flow";
import { sourceHealth } from "./health";
import { db, type Db } from "@/lib/db";
import {
  agentSightings,
  collectorState,
  commonsAiUploads,
  externalSeries,
  forumPosts,
  githubDaily,
  ingestRuns,
  mcpServers,
  osmChangesets,
  osmDaily,
  watchedPrs,
  watchedRepos,
  watchedSignals,
  wikiDaily,
  wikidataBotEdits,
  wikiEdits,
  wikiTagWatch,
} from "@/lib/db/schema";
import { dayOf, dayRange, daysAgo } from "@/lib/format";
import { cacheSummary } from "./query-cache";
import type { RadarMetadata } from "./ingest/radar";
import { publicRadarMetadata } from "./public-radar";
import { githubAgentLabel } from "@/lib/github/agents";

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
    throw new Error("Data temporarily unavailable", { cause: err });
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
    const week = new Date(daysAgo(7) + "T00:00:00Z");
    const today = new Date(dayOf() + "T00:00:00Z");
    const month = new Date(Date.now() - 30 * 86_400_000);
    const quarter = new Date(Date.now() - 90 * 86_400_000);
    const [t] = await d
      .select({
        total: count(),
        week: sql`count(*) filter (where ${watchedPrs.createdAt} >= ${week} and ${watchedPrs.createdAt} < ${today})`,
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
    const rows = await d.select().from(commonsAiUploads).where(sql`${commonsAiUploads.title} like ${"File:%"}`).orderBy(desc(commonsAiUploads.ts)).limit(limit);
    const since = daysAgo(59);
    const per = await d
      .select({ day: dayCol(commonsAiUploads.ts), c: count() })
      .from(commonsAiUploads)
      .where(and(gte(commonsAiUploads.ts, new Date(`${since}T00:00:00Z`)), sql`${commonsAiUploads.title} like ${"File:%"}`))
      .groupBy(dayCol(commonsAiUploads.ts));
    const map = new Map(per.map((p) => [String(p.day).slice(0, 10), n(p.c)]));
    const byDay = dayRange(since, dayOf()).map((day) => ({ day, c: map.get(day) ?? 0 }));
    const [c] = await d.select({ c: count() }).from(commonsAiUploads).where(and(gte(commonsAiUploads.ts, new Date(Date.now() - 30 * 86_400_000)), sql`${commonsAiUploads.title} like ${"File:%"}`));
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
  observed: boolean;
  sampled: number;
  ai: number;
}
export type OsmRow = typeof osmChangesets.$inferSelect;

export async function getOsmByDay(days = 60): Promise<OsmDay[]> {
  const since = daysAgo(days - 1);
  const rows = await safe([] as Array<{ day: string; sampled: number; aiAssisted: number }>, async (d) =>
    d.select({ day: osmDaily.day, sampled: osmDaily.sampled, aiAssisted: osmDaily.aiAssisted }).from(osmDaily).where(and(gte(osmDaily.day, since), eq(osmDaily.collectionVersion, 2))),
  );
  const map = new Map(rows.map((r) => [r.day, r]));
  return dayRange(since, dayOf()).map((day) => ({ day, observed: map.has(day), sampled: n(map.get(day)?.sampled), ai: n(map.get(day)?.aiAssisted) }));
}

export async function getOsmSummary(): Promise<{ ai7d: number; sampled7d: number; byEditor: Array<{ editor: string; c: number }>; byKind: Array<{ kind: string; c: number }>; recent: OsmRow[] }> {
  const empty = { ai7d: 0, sampled7d: 0, byEditor: [] as Array<{ editor: string; c: number }>, byKind: [] as Array<{ kind: string; c: number }>, recent: [] as OsmRow[] };
  return safe(empty, async (d) => {
    const week = daysAgo(7);
    const [t] = await d.select({ ai: sql`coalesce(sum(${osmDaily.aiAssisted}),0)`, sampled: sql`coalesce(sum(${osmDaily.sampled}),0)` }).from(osmDaily).where(and(gte(osmDaily.day, week), lt(osmDaily.day, dayOf()), eq(osmDaily.collectionVersion, 2)));
    const since = new Date(Date.now() - 30 * 86_400_000);
    const byEditor = await d.select({ editor: osmChangesets.editor, c: count() }).from(osmChangesets).where(and(gte(osmChangesets.ts, since), eq(osmChangesets.collectionVersion, 2))).groupBy(osmChangesets.editor).orderBy(desc(count())).limit(12);
    const byKind = await d.select({ kind: osmChangesets.aiKind, c: count() }).from(osmChangesets).where(and(gte(osmChangesets.ts, since), eq(osmChangesets.collectionVersion, 2))).groupBy(osmChangesets.aiKind).orderBy(desc(count()));
    const recent = await d.select().from(osmChangesets).where(eq(osmChangesets.collectionVersion, 2)).orderBy(desc(osmChangesets.ts)).limit(40);
    return { ai7d: n(t?.ai), sampled7d: n(t?.sampled), byEditor: byEditor.map((r) => ({ editor: r.editor ?? "unknown", c: n(r.c) })), byKind: byKind.map((r) => ({ kind: r.kind, c: n(r.c) })), recent };
  });
}

/* ------------------------------------------------------------------ */
/* tooling: MCP registry, botcommits, Hugging Face                    */
/* ------------------------------------------------------------------ */

export type McpRow = typeof mcpServers.$inferSelect;

export async function getMcpSummary(days = 60): Promise<{ ready: boolean; total: number; new7d: number; byDay: Array<{ day: string; c: number }>; recent: McpRow[] }> {
  const empty = { ready: false, total: 0, new7d: 0, byDay: [] as Array<{ day: string; c: number }>, recent: [] as McpRow[] };
  return safe(empty, async (d) => {
    const since = daysAgo(days - 1);
    const [state] = await d.select({ state: collectorState.state }).from(collectorState).where(eq(collectorState.key, "mcp"));
    if (!state?.state.initialComplete) return empty;
    const active = and(eq(mcpServers.syncVersion, 2), eq(mcpServers.status, "active"));
    const [t] = await d.select({ total: count(), week: sql`count(*) filter (where ${mcpServers.publishedAt} >= ${new Date(daysAgo(7) + "T00:00:00Z")} and ${mcpServers.publishedAt} < ${new Date(dayOf() + "T00:00:00Z")})` }).from(mcpServers).where(active);
    const per = await d
      .select({ day: dayCol(mcpServers.publishedAt), c: count() })
      .from(mcpServers)
      .where(and(active, gte(mcpServers.publishedAt, new Date(`${since}T00:00:00Z`))))
      .groupBy(dayCol(mcpServers.publishedAt));
    const map = new Map(per.map((p) => [String(p.day).slice(0, 10), n(p.c)]));
    const recent = await d.select().from(mcpServers).where(active).orderBy(desc(mcpServers.publishedAt)).limit(30);
    return { ready: true, total: n(t?.total), new7d: n(t?.week), byDay: dayRange(since, dayOf()).map((day) => ({ day, c: map.get(day) ?? 0 })), recent };
  });
}

export interface SeriesPoint {
  period: string;
  value: number;
  lo: number | null;
  hi: number | null;
}

/** All series for a source, keyed by series name, sorted by period. */
async function querySeries(source: string): Promise<Record<string, SeriesPoint[]>> {
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

export const getSeries = cacheSummary(querySeries, "external-series");

async function queryRadarSnapshot(): Promise<{ series: Record<string, SeriesPoint[]>; metadata: Record<string, RadarMetadata> }> {
  // One statement gives values and normalization metadata the same MVCC snapshot.
  const rows = await safe([], async (d) => d.select({
    series: externalSeries.series, period: externalSeries.period, value: externalSeries.value,
    lo: externalSeries.lo, hi: externalSeries.hi, state: collectorState.state,
  }).from(externalSeries).innerJoin(collectorState,
    sql`${collectorState.key} = 'radar:' || split_part(${externalSeries.series}, ':', 1)`)
    .where(eq(externalSeries.source, "radar-v2")).orderBy(externalSeries.period));
  const series: Record<string, SeriesPoint[]> = {};
  const metadata: Record<string, RadarMetadata> = {};
  for (const row of rows) {
    const meta = publicRadarMetadata(row.state);
    if (!meta) continue;
    metadata[row.series.split(":")[0]] = meta;
    (series[row.series] ??= []).push({ period: row.period, value: Number(row.value), lo: row.lo, hi: row.hi });
  }
  return { series, metadata };
}
export const getRadarSnapshot = cacheSummary(queryRadarSnapshot, "radar-snapshot");

export type SightingRow = typeof agentSightings.$inferSelect;

export async function getSightings(limit = 100): Promise<{ rows: SightingRow[]; counts: Record<string, number>; new30d: number }> {
  return safe({ rows: [] as SightingRow[], counts: {} as Record<string, number>, new30d: 0 }, async (d) => {
    const rows = await d.select().from(agentSightings).orderBy(desc(agentSightings.firstSeen)).limit(limit);
    const counts = await d.select({ kind: agentSightings.kind, c: count() }).from(agentSightings).groupBy(agentSightings.kind);
    // Only the crawler list carries real first-listed dates (from its git history); the
    // signed-agent registry publishes no history, so its rows are dated by our first read.
    const [nw] = await d
      .select({ c: count() })
      .from(agentSightings)
      .where(and(eq(agentSightings.kind, "ai-robots-txt"), gte(agentSightings.firstSeen, new Date(Date.now() - 30 * 86_400_000))));
    return { rows, counts: Object.fromEntries(counts.map((c) => [c.kind, n(c.c)])), new30d: n(nw?.c) };
  });
}

/* ------------------------------------------------------------------ */
/* flow animation + latest records                                    */
/* ------------------------------------------------------------------ */

/** Fixed UTC windows and aggregate-only public evidence for the dashboard. */
async function queryFlowData(days = 30): Promise<FlowData> {
  const windowEnd = dayOf();
  const windowStart = daysAgo(days);
  const empty: FlowData = { sources: [], targets: FLOW_TARGETS, links: [], feeds: [], days, windowStart, windowEnd, mode: "offline" };
  return safe(empty, async (d) => {
    const since = new Date(windowStart + "T00:00:00Z");
    const until = new Date(windowEnd + "T00:00:00Z");
    const between = (col: Parameters<typeof gte>[0]) => and(gte(col, since), lt(col, until));
    const [gh, wiki, wikidata, commons, maps, forums, runs] = await d.batch([
      d.select({ agent: githubDaily.agent, tier: githubDaily.tier, value: sql<number>`sum(${githubDaily.prs})::int`,
        days: sql<number>`count(distinct ${githubDaily.day})::int`, dates: sql<string[]>`array_agg(distinct ${githubDaily.day})`, latest: sql<string>`max(${githubDaily.day})` })
        .from(githubDaily).where(and(gte(githubDaily.day, windowStart), lt(githubDaily.day, windowEnd), inArray(githubDaily.tier, ["bot-account", "branch-prefix"])))
        .groupBy(githubDaily.agent, githubDaily.tier).orderBy(desc(sql`sum(${githubDaily.prs})`)),
      d.select({ value: count(), days: sql<number>`count(distinct ${dayCol(wikiEdits.ts)})::int`, latest: sql<Date>`max(${wikiEdits.ts})` }).from(wikiEdits).where(between(wikiEdits.ts)),
      d.select({ value: count(), days: sql<number>`count(distinct ${dayCol(wikidataBotEdits.ts)})::int`, latest: sql<Date>`max(${wikidataBotEdits.ts})` }).from(wikidataBotEdits).where(between(wikidataBotEdits.ts)),
      d.select({ value: count(), days: sql<number>`count(distinct ${dayCol(commonsAiUploads.ts)})::int`, latest: sql<Date>`max(${commonsAiUploads.ts})` }).from(commonsAiUploads).where(and(between(commonsAiUploads.ts), sql`${commonsAiUploads.title} like ${"File:%"}`)),
      d.select({ value: sql<number>`coalesce(sum(${osmDaily.aiAssisted}),0)::int`, days: count(), latest: sql<string>`max(${osmDaily.day})` }).from(osmDaily).where(and(gte(osmDaily.day, windowStart), lt(osmDaily.day, windowEnd), eq(osmDaily.collectionVersion, 2))),
      d.select({ value: count(), days: sql<number>`count(distinct ${dayCol(forumPosts.ts)})::int`, latest: sql<Date>`max(${forumPosts.ts})` }).from(forumPosts).where(between(forumPosts.ts)),
      d.selectDistinctOn([ingestRuns.source], { source: ingestRuns.source, finishedAt: ingestRuns.finishedAt, ok: ingestRuns.ok, stats: ingestRuns.stats })
        .from(ingestRuns).orderBy(ingestRuns.source, desc(ingestRuns.startedAt)),
    ]);
    const feedDefs = [{ key: "github", label: "GitHub Search" }, { key: "wikipedia", label: "Wikipedia" },
      { key: "wikimedia", label: "Wikimedia" }, { key: "osm", label: "OSM sample v2" }, { key: "moltbook", label: "Moltbook" }];
    const feeds: FlowFeed[] = feedDefs.map(({ key, label }) => {
      const run = runs.find(r => r.source === key && r.finishedAt);
      if (!run?.finishedAt) return { key, label, outcome: "unknown", lastRun: null, stale: false };
      const health = sourceHealth({ ...run, finishedAt: run.finishedAt });
      return { key, label, outcome: health.outcome, lastRun: health.lastRun, stale: health.stale };
    });
    const sources: FlowSource[] = [], links: FlowLink[] = [];
    const add = (source: FlowSource, target: string) => {
      if (source.total <= 0) return;
      sources.push(source); links.push({ source: source.id, target, value: source.total });
    };
    for (const row of gh.slice(0, 6)) add({ id: "gh:" + row.agent, label: githubAgentLabel(row.agent).replace(/ \(.*\)$/, ""),
      total: n(row.value), feed: "github", unit: "PR matches", purpose: "Code contributions",
      evidence: row.tier === "bot-account" ? "Documented bot account" : "Branch-name heuristic",
      method: "GitHub Search matches; bot-account and branch-prefix queries may overlap. Counts are not unique contributions or proof of model authorship.",
      href: "/github", observedDays: n(row.days), latestObservation: iso(row.latest) }, "code");
    const otherCoding = gh.slice(6);
    if (otherCoding.length) add({
      id: "gh:other", label: "Other coding agents", total: otherCoding.reduce((sum, r) => sum + n(r.value), 0),
      feed: "github", unit: "PR matches", purpose: "Code contributions", evidence: "Bot-account / branch-name queries",
      method: "Remaining tracked GitHub Search matches outside the six largest series. Queries may overlap; this is not a unique PR count.",
      href: "/github", observedDays: new Set(otherCoding.flatMap(r => r.dates)).size,
      latestObservation: iso(otherCoding.map(r => r.latest).sort().at(-1)),
    }, "code");
    const append = (row: {value:number; days:number; latest:Date|string|null}|undefined, source: Omit<FlowSource,"total"|"observedDays"|"latestObservation">, target:string) =>
      add({ ...source, total:n(row?.value), observedDays:n(row?.days), latestObservation:iso(row?.latest) },target);
    append(wiki[0], { id:"wiki:flagged", label:"Flagged Wikipedia edits", feed:"wikipedia", unit:"edits", purpose:"Encyclopedia editing", evidence:"Platform filters / heuristics", method:"Filter-tagged and heuristic matches; possible AI involvement, not proven authorship.", href:"/wikipedia" }, "wikis");
    append(wikidata[0], { id:"wiki:wikidata", label:"Wikidata bots", feed:"wikimedia", unit:"edits", purpose:"Structured-data editing", evidence:"Bot-account activity", method:"Tracked automation includes conventional scripts. Bot status does not establish AI use.", href:"/wikipedia/wikimedia" }, "wikis");
    append(commons[0], { id:"wiki:commons", label:"Commons AI-category files", feed:"wikimedia", unit:"files", purpose:"Media categorization", evidence:"Tracked category additions", method:"Files added to tracked AI categories; not upload counts. Non-file entries are excluded.", href:"/wikipedia/wikimedia" }, "wikis");
    append(maps[0], { id:"maps:ai", label:"AI-assisted map tools", feed:"osm", unit:"changesets", purpose:"Map editing", evidence:"Self-declared editor tags", method:"Collection v2: capped overlapping creation-time samples with persisted deduplication. Historical v1 counts are excluded.", href:"/maps" }, "maps");
    append(forums[0], { id:"forum:agents", label:"Moltbook reported agents", feed:"moltbook", unit:"posts", purpose:"Forum discussion", evidence:"Platform-reported activity", method:"The platform describes these accounts as agents; this is not independent verification of authorship.", href:"/forums" }, "forums");
    return { ...empty, mode: "observed", sources, links, feeds };
  });
}
export const getFlowData = cacheSummary(queryFlowData, "internet-flow-v1");

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
    const per = Math.max(1, Math.min(100, limit));
    const [w, p, f, o, c] = await Promise.all([
      d.select().from(wikiEdits).orderBy(desc(wikiEdits.ts)).limit(per),
      d.select().from(watchedPrs).orderBy(desc(watchedPrs.createdAt)).limit(per),
      d.select().from(forumPosts).orderBy(desc(forumPosts.ts)).limit(per),
      d.select().from(osmChangesets).where(eq(osmChangesets.collectionVersion, 2)).orderBy(desc(osmChangesets.ts)).limit(per),
      d.select().from(commonsAiUploads).where(sql`${commonsAiUploads.title} like ${"File:%"}`).orderBy(desc(commonsAiUploads.ts)).limit(per),
    ]);
    const out: LatestRecord[] = [
      ...w.map((r) => ({ id: `wiki-${r.rcid}`, kind: "wiki" as const, actor: r.user, action: r.tier === 1 ? "made a filter-flagged edit to" : "made a possible AI edit to", target: r.title, url: r.url, ts: r.ts.toISOString() })),
      ...p.map((r) => ({ id: `pr-${r.id}`, kind: "pr" as const, actor: r.agentId ? githubAgentLabel(r.agentId) : (r.actorLogin ?? "someone"), action: r.attribution === "documented_agent" ? "opened a pull request in" : "disclosed AI help in", target: `${r.repository} · ${r.title}`, url: r.url, ts: r.createdAt.toISOString() })),
      ...f.map((r) => ({ id: `forum-${r.id}`, kind: "forum" as const, actor: r.agent, action: "posted", target: r.title, url: r.url, ts: r.ts.toISOString() })),
      ...o.map((r) => ({ id: `osm-${r.id}`, kind: "map" as const, actor: r.user ?? r.editor ?? "map editor", action: `edited the map with ${r.editor ?? "an AI tool"}`, target: r.comment ?? `changeset ${r.id}`, url: r.url, ts: r.ts.toISOString() })),
      ...c.map((r) => ({ id: `commons-${r.pageid}`, kind: "commons" as const, actor: "Commons category", action: "included a file in an AI-related category", target: r.title, url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(r.title)}`, ts: r.ts.toISOString() })),
    ];
    return out.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
  });
}
