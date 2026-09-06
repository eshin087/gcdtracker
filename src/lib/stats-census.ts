import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, type Db } from "@/lib/db";
import { ghArchiveDaily } from "@/lib/db/schema";
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
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/* GH Archive census                                                  */
/* ------------------------------------------------------------------ */

export interface ArchivePeriod {
  /** YYYY-MM-DD for days, YYYY-MM for months */
  period: string;
  /** hours of data behind the number (24 per complete day) */
  hours: number;
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

type Raw = { period: string; kind: string; key: string; value: number; hours: number };

function fold(rows: Raw[]): ArchivePeriod[] {
  const byPeriod = new Map<string, ArchivePeriod & { withBody: number; withCommits: number }>();
  for (const r of rows) {
    let p = byPeriod.get(r.period);
    if (!p) {
      p = { period: r.period, hours: 0, prsOpened: 0, prsMerged: null, agentPrs: 0, agentMerged: 0, byAgent: {}, prSignatures: null, commitSignatures: null, commits: null, withBody: 0, withCommits: 0 };
      byPeriod.set(r.period, p);
    }
    const v = n(r.value);
    if (r.kind === "total") {
      if (r.key === "events") p.hours = n(r.hours);
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

export async function getArchiveDaily(days = 90): Promise<ArchivePeriod[]> {
  const rows = await safe([] as Raw[], async (d) =>
    d
      .select({ period: ghArchiveDaily.day, kind: ghArchiveDaily.kind, key: ghArchiveDaily.key, value: ghArchiveDaily.value, hours: ghArchiveDaily.hours })
      .from(ghArchiveDaily)
      .where(gte(ghArchiveDaily.day, daysAgo(days))),
  );
  return fold(rows);
}

export async function getArchiveMonthly(): Promise<ArchivePeriod[]> {
  const rows = await safe([] as Raw[], async (d) =>
    d
      .select({
        period: sql<string>`to_char(${ghArchiveDaily.day}, 'YYYY-MM')`,
        kind: ghArchiveDaily.kind,
        key: ghArchiveDaily.key,
        value: sql<number>`sum(${ghArchiveDaily.value})::int`,
        hours: sql<number>`sum(case when ${ghArchiveDaily.kind} = 'total' and ${ghArchiveDaily.key} = 'events' then ${ghArchiveDaily.hours} else 0 end)::int`,
      })
      .from(ghArchiveDaily)
      .groupBy(sql`to_char(${ghArchiveDaily.day}, 'YYYY-MM')`, ghArchiveDaily.kind, ghArchiveDaily.key),
  );
  return fold(rows);
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
  const complete = daily.filter((d) => d.hours === 24);
  const latest = complete.at(-1) ?? null;
  const sum = (rows: ArchivePeriod[]) => ({ prsOpened: rows.reduce((s, r) => s + r.prsOpened, 0), agentPrs: rows.reduce((s, r) => s + r.agentPrs, 0), days: rows.length });
  const last7 = sum(complete.slice(-7));
  const prior7 = sum(complete.slice(-14, -7));
  const coverage = await safe({ first: null as string | null, days: 0, hours: 0 }, async (d) => {
    const [row] = await d
      .select({ first: sql<string | null>`min(${ghArchiveDaily.day})`, days: sql<number>`count(*)::int`, hours: sql<number>`coalesce(sum(${ghArchiveDaily.hours}), 0)::int` })
      .from(ghArchiveDaily)
      .where(and(eq(ghArchiveDaily.kind, "total"), eq(ghArchiveDaily.key, "events")));
    return { first: row?.first ?? null, days: n(row?.days), hours: n(row?.hours) };
  });
  return { latest, last7, prior7, firstDay: coverage.first, completeDays: coverage.days, hours: coverage.hours };
}

/** Agent totals over the last N complete days, for ranking. */
export async function getArchiveAgents(days = 30): Promise<Array<{ agent: string; prs: number; merged: number }>> {
  const rows = await safe([] as Array<{ kind: string; key: string; value: number }>, async (d) =>
    d
      .select({ kind: ghArchiveDaily.kind, key: ghArchiveDaily.key, value: sql<number>`sum(${ghArchiveDaily.value})::int` })
      .from(ghArchiveDaily)
      .where(and(gte(ghArchiveDaily.day, daysAgo(days)), sql`${ghArchiveDaily.kind} in ('agent-prs', 'agent-merged')`, eq(ghArchiveDaily.hours, 24)))
      .groupBy(ghArchiveDaily.kind, ghArchiveDaily.key)
      .orderBy(desc(sql`sum(${ghArchiveDaily.value})`)),
  );
  const out = new Map<string, { agent: string; prs: number; merged: number }>();
  for (const r of rows) {
    const o = out.get(r.key) ?? { agent: r.key, prs: 0, merged: 0 };
    if (r.kind === "agent-prs") o.prs = n(r.value);
    else o.merged = n(r.value);
    out.set(r.key, o);
  }
  return [...out.values()].sort((a, b) => b.prs - a.prs);
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
  const series = await getSeries("cc-robots");
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
      else {
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
}

export async function getPackageStats(): Promise<PackageStat[]> {
  const [npm, pypi] = await Promise.all([getSeries("npm"), getSeries("pypi")]);
  return PACKAGES.map((def) => {
    const points = (def.registry === "npm" ? npm : pypi)[def.name] ?? [];
    const sum = (rows: SeriesPoint[]) => rows.reduce((s, r) => s + r.value, 0);
    return { def, points, last7: sum(points.slice(-7)), prior7: sum(points.slice(-14, -7)), latestDay: points.at(-1)?.period ?? null };
  }).sort((a, b) => b.last7 - a.last7);
}
