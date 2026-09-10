import {
  bigint,
  bigserial,
  boolean,
  char,
  date,
  doublePrecision,
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

/** Historical request observations retained for compatibility and privacy-safe exports. */
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

/** Historical daily request counters retained for compatibility. */
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

/** Durable progress independent of the short-lived run log. */
export const collectorState = pgTable("collector_state", {
  key: text("key").primaryKey(),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ---------- watched repositories (native collector) ---------- */

export const watchedRepos = pgTable("watched_repos", {
  repo: text("repo").primaryKey(),
  /** seed | auto */
  source: text("source").notNull().default("seed"),
  firstSeen: ts("first_seen").notNull().defaultNow(),
  lastPolledAt: ts("last_polled_at"),
  lastPrAt: ts("last_pr_at"),
  prCount30d: integer("pr_count_30d").notNull().default(0),
});

/** Documented or self-disclosed agent pull requests in watched repositories. */
export const watchedPrs = pgTable(
  "watched_prs",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    platform: text("platform").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    actorLogin: text("actor_login"),
    actorId: bigint("actor_id", { mode: "number" }),
    agentId: text("agent_id"),
    /** documented_agent | self_disclosed */
    attribution: text("attribution").notNull(),
    repository: text("repository"),
    state: text("state"),
    createdAt: ts("created_at").notNull(),
    sourceUpdatedAt: ts("source_updated_at"),
    lastObservedAt: ts("last_observed_at"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    evidence: text("evidence"),
    bodyExcerpt: text("body_excerpt"),
  },
  (t) => [
    index("watched_prs_created_idx").on(t.createdAt.desc()),
    index("watched_prs_agent_created_idx").on(t.agentId, t.createdAt.desc()),
    index("watched_prs_repo_idx").on(t.repository),
  ],
);

/** Self-disclosure candidates awaiting human review (data/reviews.json). */
export const watchedSignals = pgTable("watched_signals", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull(),
  ruleId: text("rule_id").notNull(),
  excerpt: text("excerpt"),
  /** unreviewed | needs_evidence | confirmed | dismissed */
  status: text("status").notNull().default("unreviewed"),
  reason: text("reason"),
  url: text("url"),
  reviewedAt: ts("reviewed_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ---------- wikimedia-wide ---------- */

export const wikidataBotEdits = pgTable(
  "wikidata_bot_edits",
  {
    revid: bigint("revid", { mode: "number" }).primaryKey(),
    user: text("user").notNull(),
    userId: bigint("user_id", { mode: "number" }),
    title: text("title").notNull(),
    ts: ts("ts").notNull(),
    comment: text("comment"),
    size: integer("size"),
  },
  (t) => [index("wikidata_bot_edits_ts_idx").on(t.ts.desc())],
);

export const commonsAiUploads = pgTable(
  "commons_ai_uploads",
  {
    pageid: bigint("pageid", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    ts: ts("ts").notNull(),
    category: text("category").notNull(),
  },
  (t) => [index("commons_ai_uploads_ts_idx").on(t.ts.desc())],
);

export const wikiTagWatch = pgTable(
  "wiki_tag_watch",
  {
    wiki: text("wiki").notNull(),
    tag: text("tag").notNull(),
    hitcount: integer("hitcount").notNull().default(0),
    active: boolean("active").notNull().default(true),
    firstSeen: ts("first_seen").notNull().defaultNow(),
    lastSeen: ts("last_seen").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.wiki, t.tag] })],
);

/* ---------- OpenStreetMap ---------- */

export const osmChangesets = pgTable(
  "osm_changesets",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
    collectionVersion: smallint("collection_version").notNull().default(1),
    ts: ts("ts").notNull(),
    user: text("user"),
    editor: text("editor"),
    /** rapid | mapwithai | osmose | bot | other-ai */
    aiKind: text("ai_kind").notNull(),
    changes: integer("changes"),
    comment: text("comment"),
    url: text("url").notNull(),
  },
  (t) => [index("osm_changesets_ts_idx").on(t.ts.desc())],
);

export const osmDaily = pgTable("osm_daily", {
  day: day("day").notNull(),
  collectionVersion: smallint("collection_version").notNull().default(1),
  sampled: integer("sampled").notNull().default(0),
  aiAssisted: integer("ai_assisted").notNull().default(0),
  byEditor: jsonb("by_editor").$type<Record<string, number>>(),
}, (t) => [primaryKey({ columns: [t.day, t.collectionVersion] })]);

/** Seven-day deduplication ledger for the bounded, 48-hour OSM sample. */
export const osmSampleSeen = pgTable("osm_sample_seen", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  createdAt: ts("created_at").notNull(),
  closedAt: ts("closed_at").notNull(),
  day: day("day").notNull(),
  aiKind: text("ai_kind"),
  editor: text("editor"),
}, (t) => [index("osm_sample_seen_day_idx").on(t.day)]);

/* ---------- agent tooling ---------- */

export const mcpServers = pgTable(
  "mcp_servers",
  {
    name: text("name").primaryKey(),
    status: text("status").notNull().default("unknown"),
    syncVersion: smallint("sync_version").notNull().default(1),
    title: text("title"),
    description: text("description"),
    url: text("url"),
    publishedAt: ts("published_at"),
    updatedAt: ts("updated_at"),
    firstSeen: ts("first_seen").notNull().defaultNow(),
  },
  (t) => [index("mcp_servers_published_idx").on(t.publishedAt.desc())],
);

/** Time series quoted from external aggregators (botcommits.dev, Hugging Face, Cloudflare Radar). */
export const externalSeries = pgTable(
  "external_series",
  {
    source: text("source").notNull(),
    series: text("series").notNull(),
    /** YYYY-MM or YYYY-MM-DD */
    period: text("period").notNull(),
    value: doublePrecision("value").notNull(),
    lo: doublePrecision("lo"),
    hi: doublePrecision("hi"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.source, t.series, t.period] })],
);

/** Newly published agent identities: ai.robots.txt tokens and signed-agent directories. */
export const agentSightings = pgTable(
  "agent_sightings",
  {
    id: serial("id").primaryKey(),
    /** ai-robots-txt | signature-registry */
    kind: text("kind").notNull(),
    token: text("token").notNull(),
    operator: text("operator"),
    fn: text("fn"),
    url: text("url"),
    firstSeen: ts("first_seen").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_sightings_kind_token_uq").on(t.kind, t.token), index("agent_sightings_first_seen_idx").on(t.firstSeen.desc())],
);

/**
 * GH Archive census: every public GitHub event, counted per hour by the Actions
 * historical worker payloads. kind ∈ total | agent-prs | agent-merged |
 * pr-signature | commit-signature; key is the metric name, agent key or tool key.
 */
export const ghArchiveHourly = pgTable(
  "gh_archive_hourly",
  {
    /** YYYY-MM-DDTHH (UTC) */
    hour: text("hour").notNull(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    value: integer("value").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hour, t.kind, t.key] })],
);

/** Daily roll-up of gh_archive_hourly, recomputed for every day a batch touches. */
export const ghArchiveDaily = pgTable(
  "gh_archive_daily",
  {
    day: day("day").notNull(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    value: integer("value").notNull(),
    /** hours of the day present in the hourly table (24 = complete) */
    hours: integer("hours").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.kind, t.key] }), index("gh_archive_daily_kind_day_idx").on(t.kind, t.day.desc())],
);

/** Written atomically with a validated, complete hourly replacement. */
export const ghArchiveCompleted = pgTable("gh_archive_completed", {
  hour: text("hour").primaryKey(),
  ingestVersion: smallint("ingest_version").notNull(),
  completedAt: ts("completed_at").notNull().defaultNow(),
});
