import { sql, type SQL } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { resultRows } from "./ingest/state";
import { calendarWindow, dateBefore, isUtcDay } from "./ingest/windows";
import { daysAgo } from "@/lib/format";
import { PACKAGES, type TrackedPackage } from "@/lib/ingest/packages";
import { ROBOTS_TOKENS } from "@/lib/robots/tokens";
import { getSeries, type SeriesPoint } from "@/lib/stats-sources";

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

async function safe<T>(fallback: T, fn: (d: Db) => Promise<T>): Promise<T> {
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch (err) {
    console.error("stats-census query failed", err);
    throw new Error("Data temporarily unavailable", { cause: err });
  }
}

/* ------------------------------------------------------------------ */
/* GH Archive census                                                  */
/* ------------------------------------------------------------------ */

export { AI_MARKERS, AGENT_LAUNCHES } from "./census-markers";

export interface ArchivePeriod {
  /** YYYY-MM-DD for days, YYYY-MM for months */
  period: string;
  /** hours of data behind the number (24 per complete day) */
  hours: number;
  /** Hours atomically completed by the version-2 collector. Legacy history is not certified. */
  validatedHours: number;
  /** A known thin day also makes its containing month unsuitable for share comparisons. */
  partialFeed?: boolean;
  /** all events in the period; a coverage check, since GH Archive occasionally records only part of GitHub's feed */
  events: number;
  prsOpened: number;
  /** null where the archive format carried no merge information */
  prsMerged: number | null;
  agentPrs: number;
  agentMerged: number;
  byAgent: Record<string, number>;
  /** PR bodies naming a tool, by tool; null where bodies were absent from the feed */
  prSignatures: Record<string, number> | null;
  /** commit messages naming a tool, by tool; null where commit lists were absent */
  commitSignatures: Record<string, number> | null;
  commits: number | null;
}

export type ArchiveRaw = { period: string; kind: string; key: string; value: number; hours: number; validatedHours: number; partialFeed?: boolean };
type Raw = ArchiveRaw;

export function foldArchiveRows(rows: Raw[]): ArchivePeriod[] {
  const byPeriod = new Map<string, ArchivePeriod & { withBody: number; withCommits: number }>();
  for (const r of rows) {
    let p = byPeriod.get(r.period);
    if (!p) {
      p = { period: r.period, hours: 0, validatedHours: n(r.validatedHours), partialFeed: r.partialFeed ?? false, events: 0, prsOpened: 0, prsMerged: null, agentPrs: 0, agentMerged: 0, byAgent: {}, prSignatures: null, commitSignatures: null, commits: null, withBody: 0, withCommits: 0 };
      byPeriod.set(r.period, p);
    }
    const v = n(r.value);
    if (r.kind === "total") {
      if (r.key === "events") {
        p.hours = n(r.hours);
        p.events = v;
      }
      else if (r.key === "prs_opened") p.prsOpened = v;
      else if (r.key === "prs_merged" && v > 0) p.prsMerged = v;
      else if (r.key === "prs_with_body") p.withBody = v;
      else if (r.key === "pushes_with_commits") p.withCommits = v;
      else if (r.key === "commits") p.commits = v;
    } else if (r.kind === "agent-prs") {
      p.byAgent[r.key] = v;
      p.agentPrs += v;
    } else if (r.kind === "agent-merged") p.agentMerged += v;
    else if (r.kind === "pr-signature") (p.prSignatures ??= {})[r.key] = v;
    else if (r.kind === "commit-signature") (p.commitSignatures ??= {})[r.key] = v;
  }
  return [...byPeriod.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map(({ withBody, withCommits, ...p }) => ({
      ...p,
      prSignatures: withBody > 0 ? (p.prSignatures ?? {}) : null,
      commitSignatures: withCommits > 0 ? (p.commitSignatures ?? {}) : null,
      commits: withCommits > 0 ? p.commits : null,
    }));
}

/**
 * GitHub opens several thousand pull requests an hour; when an archived hour holds far
 * fewer, GH Archive's collector caught only part of the public feed (it happened for
 * most of June to August 2026). Absolute counts for such periods are floors; the share
 * may also be biased: equal coverage of agents and humans has not been established.
 */
export const PARTIAL_ARCHIVE_PRS_PER_HOUR = 1_000;
export const isPartialArchive = (p: ArchivePeriod) => p.partialFeed === true || (p.hours > 0 && p.prsOpened / p.hours < PARTIAL_ARCHIVE_PRS_PER_HOUR);

/** Ratios compare only closed, fully validated periods without a known feed shortfall. */
export function isComparableArchivePeriod(p: ArchivePeriod, today = new Date().toISOString().slice(0, 10)): boolean {
  let expectedHours: number;
  if (isUtcDay(p.period)) {
    expectedHours = 24;
    if (p.period >= today) return false;
  } else if (/^\d{4}-\d{2}$/.test(p.period)) {
    if (p.period >= today.slice(0, 7)) return false;
    const [year, month] = p.period.split("-").map(Number);
    if (month < 1 || month > 12) return false;
    expectedHours = new Date(Date.UTC(year, month, 0)).getUTCDate() * 24;
  } else return false;
  return p.hours === expectedHours && p.validatedHours === expectedHours && !isPartialArchive(p);
}

export const fmtMonth = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** Aggregate markers in Postgres; join them in the same snapshot as the data rows. */
function archiveCoverage(length: 7 | 10, since?: string): SQL {
  return sql`select left(hour, ${length}) as period, count(*)::int as validated_hours from gh_archive_completed
    where ingest_version = 2 ${since ? sql`and hour >= ${since}` : sql``} group by 1`;
}
export function archiveDailyQuery(since: string): SQL {
  return sql`with coverage as (${archiveCoverage(10, since)})
    select d.day::text as period, d.kind, d.key, d.value, d.hours, coalesce(c.validated_hours,0)::int as "validatedHours"
    from gh_archive_daily d left join coverage c on c.period = d.day::text
    where d.day >= ${since}::date`;
}
export async function getArchiveDaily(days = 90): Promise<ArchivePeriod[]> {
  const rows = await safe([] as Raw[], async (d) => resultRows<Raw>(await d.execute(archiveDailyQuery(daysAgo(days - 1)))));
  return foldArchiveRows(rows);
}
export function archiveMonthlyQuery(): SQL {
  return sql`with coverage as (${archiveCoverage(7)}), feed as (
    select to_char(e.day,'YYYY-MM') as period, bool_or(p.value is null or e.hours=0 or p.value < e.hours * ${PARTIAL_ARCHIVE_PRS_PER_HOUR}) as partial
    from gh_archive_daily e left join gh_archive_daily p on p.day=e.day and p.kind='total' and p.key='prs_opened'
    where e.kind='total' and e.key='events' group by to_char(e.day,'YYYY-MM')
  )
    select to_char(d.day,'YYYY-MM') as period, d.kind, d.key, sum(d.value)::bigint as value,
      sum(case when d.kind='total' and d.key='events' then d.hours else 0 end)::int as hours,
      coalesce(max(c.validated_hours),0)::int as "validatedHours", coalesce(bool_or(f.partial),true) as "partialFeed"
    from gh_archive_daily d left join coverage c on c.period = to_char(d.day,'YYYY-MM')
    left join feed f on f.period = to_char(d.day,'YYYY-MM')
    group by to_char(d.day,'YYYY-MM'), d.kind, d.key`;
}
export async function getArchiveMonthly(): Promise<ArchivePeriod[]> {
  const rows = await safe([] as Raw[], async (d) => resultRows<Raw>(await d.execute(archiveMonthlyQuery())));
  return foldArchiveRows(rows);
}

export interface ArchiveSummary {
  /** latest complete UTC day */
  latest: ArchivePeriod | null;
  last7: { prsOpened: number; agentPrs: number; days: number };
  prior7: { prsOpened: number; agentPrs: number; days: number };
  firstDay: string | null;
  completeDays: number;
  hours: number;
}

export const EMPTY_ARCHIVE: ArchiveSummary = { latest: null, last7: { prsOpened: 0, agentPrs: 0, days: 0 }, prior7: { prsOpened: 0, agentPrs: 0, days: 0 }, firstDay: null, completeDays: 0, hours: 0 };

export async function getArchiveSummary(): Promise<ArchiveSummary> {
  const daily = await getArchiveDaily(20);
  const today = new Date().toISOString().slice(0, 10);
  const complete = daily.filter((d) => isComparableArchivePeriod(d, today));
  const latest = complete.at(-1) ?? null;
  const sum = (rows: ArchivePeriod[]) => ({ prsOpened: rows.reduce((s, r) => s + r.prsOpened, 0), agentPrs: rows.reduce((s, r) => s + r.agentPrs, 0), days: rows.length });
  const last7 = sum(calendarWindow(complete, (d) => d.period, dateBefore(today, 7), today));
  const prior7 = sum(calendarWindow(complete, (d) => d.period, dateBefore(today, 14), dateBefore(today, 7)));
  const coverage = await safe({ first: null as string | null, days: 0, hours: 0 }, async (d) => {
    const [row] = resultRows<{ first: string | null; days: number; hours: number }>(await d.execute(sql`
      with coverage as (${archiveCoverage(10)})
      select min(e.day)::text as first,
        count(*) filter (where e.hours=24 and c.validated_hours=24 and p.value >= ${24 * 1000} and e.day < ${today}::date)::int as days,
        coalesce(sum(e.hours),0)::int as hours
      from gh_archive_daily e left join coverage c on c.period=e.day::text
      left join gh_archive_daily p on p.day=e.day and p.kind='total' and p.key='prs_opened'
      where e.kind='total' and e.key='events'`));
    return { first: row?.first ?? null, days: n(row?.days), hours: n(row?.hours) };
  });
  return { latest, last7, prior7, firstDay: coverage.first, completeDays: coverage.days, hours: coverage.hours };
}

export interface ShareDay {
  day: string;
  hours: number;
  validatedHours: number;
  prsOpened: number;
  agentPrs: number;
  /** 0..1, null when the day has no PRs */
  share: number | null;
  partial: boolean;
}

export function archiveShareQuery(): SQL {
  return sql`with coverage as (${archiveCoverage(10)})
    select d.day::text as day,
      coalesce(max(d.hours) filter(where d.kind='total' and d.key='events'),0)::int as hours,
      coalesce(max(c.validated_hours),0)::int as "validatedHours",
      coalesce(sum(d.value) filter(where d.kind='agent-prs'),0)::bigint as agent,
      coalesce(sum(d.value) filter(where d.kind='total' and d.key='prs_opened'),0)::bigint as prs
    from gh_archive_daily d left join coverage c on c.period=d.day::text
    where d.kind in ('agent-prs','total') group by d.day order by d.day`;
}
export function archiveShareRow(r: { day: string; hours: number; validatedHours: number; agent: number; prs: number }, today = new Date().toISOString().slice(0, 10)): ShareDay {
  const prs = n(r.prs), hours = n(r.hours), validatedHours = n(r.validatedHours);
  const partial = hours !== 24 || validatedHours !== 24 || r.day >= today || prs / hours < PARTIAL_ARCHIVE_PRS_PER_HOUR;
  return { day: r.day, hours, validatedHours, prsOpened: prs, agentPrs: n(r.agent), share: !partial && prs > 0 ? n(r.agent) / prs : null, partial };
}
/** Unvalidated/incomplete observations remain visible as gaps, never as comparable shares. */
export async function getArchiveShareByDay(): Promise<ShareDay[]> {
  const rows = await safe([] as Array<{ day: string; hours: number; validatedHours: number; agent: number; prs: number }>, async (d) =>
    resultRows<{ day: string; hours: number; validatedHours: number; agent: number; prs: number }>(await d.execute(archiveShareQuery())));
  return rows.map((r) => archiveShareRow(r));
}

/** Agent share by weekday over complete, non-partial days in the last `window` days. */
export function shareByWeekday(days: ShareDay[], window = 182): Array<{ dow: number; label: string; share: number; days: number }> {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const acc = labels.map((label, dow) => ({ dow, label, prs: 0, agent: 0, days: 0 }));
  const since = daysAgo(window);
  for (const d of days) {
    if (d.day < since || d.day >= daysAgo(0) || d.hours !== 24 || d.validatedHours !== 24 || d.partial || d.share === null) continue;
    const dow = (new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7;
    acc[dow].prs += d.prsOpened;
    acc[dow].agent += d.agentPrs;
    acc[dow].days++;
  }
  return acc.map((a) => ({ dow: a.dow, label: a.label, share: a.prs > 0 ? a.agent / a.prs : 0, days: a.days }));
}

export function archiveAgentsQuery(since: string, today: string): SQL {
  return sql`with coverage as (${archiveCoverage(10, since)})
    select a.kind, a.key, sum(a.value)::bigint as value from gh_archive_daily a
    join coverage c on c.period=a.day::text and c.validated_hours=24
    join gh_archive_daily p on p.day=a.day and p.kind='total' and p.key='prs_opened' and p.value >= ${24 * 1000}
    where a.day >= ${since}::date and a.day < ${today}::date and a.hours=24 and a.kind in ('agent-prs','agent-merged')
    group by a.kind,a.key order by sum(a.value) desc`;
}
/** Ranking uses validated, complete, non-thin days within a fixed calendar window. */
export async function getArchiveAgents(days = 30): Promise<Array<{ agent: string; prs: number; merged: number }>> {
  const rows = await safe([] as Array<{ kind: string; key: string; value: number }>, async (d) =>
    resultRows<{ kind: string; key: string; value: number }>(await d.execute(archiveAgentsQuery(daysAgo(days), daysAgo(0)))));
  const out = new Map<string, { agent: string; prs: number; merged: number }>();
  for (const r of rows) {
    const o = out.get(r.key) ?? { agent: r.key, prs: 0, merged: 0 };
    if (r.kind === "agent-prs") o.prs = n(r.value); else o.merged = n(r.value);
    out.set(r.key, o);
  }
  return [...out.values()].sort((a,b) => b.prs-a.prs);
}

/* ------------------------------------------------------------------ */
/* robots.txt census                                                  */
/* ------------------------------------------------------------------ */

export interface RobotsCrawl {
  date: string;
  sites: number;
  files: number;
  tokens: Record<string, { mentioned: number; blocked: number }>;
}

export async function getRobotsCensus(): Promise<RobotsCrawl[]> {
  const series = await getSeries("cc-robots-v2");
  const byDate = new Map<string, RobotsCrawl>();
  const get = (date: string) => {
    let c = byDate.get(date);
    if (!c) {
      c = { date, sites: 0, files: 0, tokens: {} };
      byDate.set(date, c);
    }
    return c;
  };
  for (const [name, pts] of Object.entries(series)) {
    for (const p of pts) {
      const c = get(p.period);
      if (name === "_sites") c.sites = p.value;
      else if (name === "_files") c.files = p.value;
      else if (!name.startsWith("_")) {
        const i = name.lastIndexOf(":");
        const token = name.slice(0, i);
        const measure = name.slice(i + 1) as "mentioned" | "blocked";
        (c.tokens[token] ??= { mentioned: 0, blocked: 0 })[measure] = p.value;
      }
    }
  }
  return [...byDate.values()].filter((c) => c.sites > 0).sort((a, b) => a.date.localeCompare(b.date));
}

export const ROBOTS_LABELS: Record<string, string> = Object.fromEntries(
  ROBOTS_TOKENS.map((t) => [t, t === "*" ? "all crawlers (wildcard group)" : t]),
);

export const ROBOTS_OPERATORS: Record<string, string> = {
  GPTBot: "OpenAI",
  "ChatGPT-User": "OpenAI",
  "OAI-SearchBot": "OpenAI",
  ClaudeBot: "Anthropic",
  "anthropic-ai": "Anthropic",
  "Claude-Web": "Anthropic",
  "Claude-User": "Anthropic",
  "Claude-SearchBot": "Anthropic",
  CCBot: "Common Crawl",
  "Google-Extended": "Google",
  PerplexityBot: "Perplexity",
  "Perplexity-User": "Perplexity",
  Bytespider: "ByteDance",
  "Applebot-Extended": "Apple",
  Amazonbot: "Amazon",
  "meta-externalagent": "Meta",
  FacebookBot: "Meta",
  "cohere-ai": "Cohere",
  Diffbot: "Diffbot",
  ImagesiftBot: "Hive",
  omgili: "Webz.io",
  YouBot: "You.com",
  DuckAssistBot: "DuckDuckGo",
  AI2Bot: "Allen Institute",
  PetalBot: "Huawei",
  Googlebot: "Google (search, control)",
  Bingbot: "Microsoft (search, control)",
  "*": "every crawler",
};

/** How each operator splits its crawlers: what trains models, what serves search, what fetches for a user. */
export const ROBOTS_ROLES: Record<string, "training" | "search" | "fetcher" | "control"> = {
  GPTBot: "training",
  "OAI-SearchBot": "search",
  "ChatGPT-User": "fetcher",
  ClaudeBot: "training",
  "anthropic-ai": "training",
  "Claude-Web": "training",
  "Claude-SearchBot": "search",
  "Claude-User": "fetcher",
  CCBot: "training",
  "Google-Extended": "training",
  PerplexityBot: "search",
  "Perplexity-User": "fetcher",
  Bytespider: "training",
  "Applebot-Extended": "training",
  Amazonbot: "training",
  "meta-externalagent": "training",
  FacebookBot: "training",
  "cohere-ai": "training",
  Diffbot: "training",
  ImagesiftBot: "training",
  omgili: "training",
  YouBot: "search",
  DuckAssistBot: "search",
  AI2Bot: "training",
  Googlebot: "control",
  Bingbot: "control",
};

/* ------------------------------------------------------------------ */
/* package downloads                                                  */
/* ------------------------------------------------------------------ */

export interface PackageStat {
  def: TrackedPackage;
  points: SeriesPoint[];
  last7: number;
  prior7: number;
  /** most recent day with data */
  latestDay: string | null;
  coverage7d: number;
  coveragePrior7d: number;
}

export async function getPackageStats(): Promise<PackageStat[]> {
  const [npm, pypi] = await Promise.all([getSeries("npm"), getSeries("pypi")]);
  return PACKAGES.map((def) => {
    const points = (def.registry === "npm" ? npm : pypi)[def.name] ?? [];
    const sum = (rows: SeriesPoint[]) => rows.reduce((s, r) => s + r.value, 0);
    const today = new Date().toISOString().slice(0, 10);
    const recent = calendarWindow(points, (p) => p.period, dateBefore(today, 7), today);
    const prior = calendarWindow(points, (p) => p.period, dateBefore(today, 14), dateBefore(today, 7));
    return { def, points, last7: sum(recent), prior7: sum(prior), coverage7d: recent.length, coveragePrior7d: prior.length, latestDay: points.at(-1)?.period ?? null };
  }).sort((a, b) => b.last7 - a.last7);
}
