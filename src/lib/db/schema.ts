import {
  bigint,
  bigserial,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });

/** Raw hits by AI agents, honeypot visitors and robots/llms.txt readers. */
export const visits = pgTable(
  "visits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ts: ts("ts").notNull().defaultNow(),
    day: day("day").notNull(),
    path: text("path").notNull(),
    method: text("method").notNull(),
    ua: text("ua").notNull(),
    agentSlug: text("agent_slug"),
    agentName: text("agent_name"),
    operator: text("operator"),
    category: text("category").notNull(),
    /** true = IP inside the operator's published ranges; false = outside; null = unverifiable */
    verified: boolean("verified"),
    verifiedBy: text("verified_by"),
    signed: boolean("signed").notNull().default(false),
    signatureAgent: text("signature_agent"),
    ipPrefix: text("ip_prefix"),
    ipHash: text("ip_hash"),
    country: char("country", { length: 2 }),
    referer: text("referer"),
    robotsViolation: boolean("robots_violation").notNull().default(false),
    trapToken: text("trap_token"),
  },
  (t) => [
    index("visits_ts_idx").on(t.ts.desc()),
    index("visits_agent_ts_idx").on(t.agentSlug, t.ts.desc()),
    index("visits_day_cat_idx").on(t.day, t.category),
  ],
);

/** One counter per (day, category) for every request the proxy sees. */
export const trafficDaily = pgTable(
  "traffic_daily",
  {
    day: day("day").notNull(),
    category: text("category").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.category] })],
);

export const wikiEdits = pgTable(
  "wiki_edits",
  {
    wiki: text("wiki").notNull(),
    rcid: bigint("rcid", { mode: "number" }).notNull(),
    revId: bigint("rev_id", { mode: "number" }),
    ts: ts("ts").notNull(),
    title: text("title").notNull(),
    user: text("user").notNull(),
    comment: text("comment"),
    tags: text("tags").array().notNull().default([]),
    /** 1 = flagged by Wikipedia's own edit filters, 2 = our heuristics */
    tier: smallint("tier").notNull(),
    signals: text("signals").array().notNull().default([]),
    oldLen: integer("old_len"),
    newLen: integer("new_len"),
    url: text("url").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.wiki, t.rcid] }),
    index("wiki_edits_ts_idx").on(t.ts.desc()),
    index("wiki_edits_wiki_tier_ts_idx").on(t.wiki, t.tier, t.ts.desc()),
  ],
);

/** Daily totals from the Wikimedia metrics API (lags a few days). */
export const wikiDaily = pgTable(
  "wiki_daily",
  {
    day: day("day").notNull(),
    wiki: text("wiki").notNull(),
    total: integer("total"),
    bot: integer("bot"),
    anon: integer("anon"),
  },
  (t) => [primaryKey({ columns: [t.day, t.wiki] })],
);

export const githubDaily = pgTable(
  "github_daily",
  {
    day: day("day").notNull(),
    agent: text("agent").notNull(),
    prs: integer("prs").notNull().default(0),
    /** bot-account | branch-prefix */
    tier: text("tier").notNull(),
    final: boolean("final").notNull().default(false),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.day, t.agent] })],
);

export const githubEvents = pgTable(
  "github_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    agent: text("agent").notNull(),
    repo: text("repo").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    createdAt: ts("created_at").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [
    index("github_events_created_idx").on(t.createdAt.desc()),
    index("github_events_agent_created_idx").on(t.agent, t.createdAt.desc()),
  ],
);

export const forumPosts = pgTable(
  "forum_posts",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    agentId: text("agent_id"),
    ts: ts("ts").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    url: text("url").notNull(),
    board: text("board"),
    score: integer("score"),
    comments: integer("comments"),
  },
  (t) => [index("forum_posts_ts_idx").on(t.ts.desc())],
);

export const forumDaily = pgTable("forum_daily", {
  day: day("day").primaryKey(),
  posts: integer("posts").notNull().default(0),
  agents: integer("agents").notNull().default(0),
});

export const guestbookNotes = pgTable(
  "guestbook_notes",
  {
    id: serial("id").primaryKey(),
    ts: ts("ts").notNull().defaultNow(),
    name: text("name").notNull(),
    operator: text("operator"),
    purpose: text("purpose"),
    note: text("note").notNull(),
    ua: text("ua").notNull(),
    agentSlug: text("agent_slug"),
    signed: boolean("signed").notNull().default(false),
    signatureAgent: text("signature_agent"),
    ipPrefix: text("ip_prefix"),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [index("guestbook_ts_idx").on(t.ts.desc())],
);

export const ipRanges = pgTable(
  "ip_ranges",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    operator: text("operator").notNull(),
    cidr: text("cidr").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ip_ranges_source_cidr_uq").on(t.source, t.cidr), index("ip_ranges_source_idx").on(t.source)],
);

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    ok: boolean("ok").notNull().default(false),
    cursor: text("cursor"),
    stats: jsonb("stats").$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (t) => [index("ingest_runs_source_started_idx").on(t.source, t.startedAt.desc())],
);
