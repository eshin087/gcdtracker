import { sql } from "drizzle-orm";
import { z } from "zod";
import { observatoryActivities, observatoryAgents, observatoryCandidates } from "@/lib/db/schema";
import { fetchJson, type Job, timeLeft } from "./common";

/**
 * The sibling site (built separately, https://gcdtracker.vercel.app) publishes a daily
 * snapshot of documented agent pull requests from a watch-list of repositories.
 * We mirror it into our database so history survives its 90-day rolling window.
 */
export const OBSERVATORY = {
  name: "gcdTracker observatory",
  site: "https://gcdtracker.vercel.app",
  api: "https://gcdtracker.vercel.app/api/snapshot",
  fallback: "https://raw.githubusercontent.com/eshin087/gcdTracker/data/snapshot.json",
  repo: "https://github.com/eshin087/gcdTracker",
  staleAfterHours: 36,
} as const;

const Activity = z.object({
  id: z.string().min(1),
  sourceId: z.string(),
  platform: z.string(),
  kind: z.string(),
  title: z.string(),
  url: z.string().url(),
  actor: z.object({ id: z.number().optional(), login: z.string().optional() }).optional(),
  agentId: z.string().nullable().optional(),
  attribution: z.string(),
  createdAt: z.string(),
  sourceUpdatedAt: z.string().optional(),
  lastObservedAt: z.string().optional(),
  repository: z.string().optional(),
  state: z.string().optional(),
});
const Candidate = z.object({
  id: z.string().min(1),
  activityId: z.string(),
  ruleId: z.string(),
  excerpt: z.string().optional(),
  status: z.string(),
  evidenceUrls: z.array(z.string()).optional(),
});
const Agent = z.object({
  id: z.string().min(1),
  name: z.string(),
  operator: z.string().optional(),
  kind: z.string().optional(),
  platform: z.string().optional(),
  identity: z.object({ login: z.string().optional(), id: z.number().optional() }).optional(),
  historical: z.boolean().optional(),
  lastActivityAt: z.string().nullable().optional(),
  website: z.string().optional(),
});
export const Snapshot = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  agents: z.array(z.unknown()),
  activities: z.array(z.unknown()),
  candidates: z.array(z.unknown()).default([]),
  sources: z.array(z.unknown()).default([]),
});

export type SnapshotRows = ReturnType<typeof parseSnapshot>;

/** Validate a snapshot and convert it to row shapes. Individual bad records are skipped, not fatal. */
export function parseSnapshot(input: unknown) {
  const snap = Snapshot.parse(input);
  const activities = [];
  for (const raw of snap.activities) {
    const r = Activity.safeParse(raw);
    if (!r.success) continue;
    const a = r.data;
    activities.push({
      id: a.id,
      sourceId: a.sourceId,
      platform: a.platform,
      kind: a.kind,
      title: a.title.slice(0, 300),
      url: a.url,
      actorLogin: a.actor?.login ?? null,
      actorId: a.actor?.id ?? null,
      agentId: a.agentId ?? null,
      attribution: a.attribution,
      repository: a.repository ?? null,
      state: a.state ?? null,
      createdAt: new Date(a.createdAt),
      sourceUpdatedAt: a.sourceUpdatedAt ? new Date(a.sourceUpdatedAt) : null,
      lastObservedAt: a.lastObservedAt ? new Date(a.lastObservedAt) : null,
    });
  }
  const candidates = [];
  for (const raw of snap.candidates) {
    const r = Candidate.safeParse(raw);
    if (!r.success) continue;
    const c = r.data;
    candidates.push({ id: c.id, activityId: c.activityId, ruleId: c.ruleId, excerpt: c.excerpt?.slice(0, 500) ?? null, status: c.status, url: c.evidenceUrls?.[0] ?? null });
  }
  const agents = [];
  for (const raw of snap.agents) {
    const r = Agent.safeParse(raw);
    if (!r.success) continue;
    const a = r.data;
    agents.push({
      id: a.id,
      name: a.name,
      operator: a.operator ?? null,
      kind: a.kind ?? null,
      platform: a.platform ?? null,
      login: a.identity?.login ?? null,
      identityId: a.identity?.id ?? null,
      historical: a.historical ?? false,
      lastActivityAt: a.lastActivityAt ? new Date(a.lastActivityAt) : null,
      website: a.website ?? null,
    });
  }
  const generatedAt = new Date(snap.generatedAt);
  const stale = Date.now() - generatedAt.getTime() > OBSERVATORY.staleAfterHours * 3_600_000;
  return { generatedAt: snap.generatedAt, stale, activities, candidates, agents, sources: snap.sources.length };
}

export const observatoryJob: Job = async (ctx) => {
  let res = await fetchJson<unknown>(OBSERVATORY.api, {}, 30_000);
  let origin = res.headers.get("x-gcd-data-origin") ?? "unknown";
  if (res.status !== 200 || !res.body) {
    res = await fetchJson<unknown>(OBSERVATORY.fallback, {}, 30_000);
    origin = "github-raw";
    if (res.status !== 200 || !res.body) throw new Error(`observatory snapshot ${res.status}`);
  }
  const rows = parseSnapshot(res.body);
  const stats: Record<string, unknown> = {
    generatedAt: rows.generatedAt,
    origin,
    stale: rows.stale,
    activities: rows.activities.length,
    candidates: rows.candidates.length,
    agents: rows.agents.length,
    sources: rows.sources,
  };
  const now = new Date();

  for (let i = 0; i < rows.activities.length; i += 200) {
    if (timeLeft(ctx) < 10_000) {
      stats.partial = true;
      break;
    }
    await ctx.db
      .insert(observatoryActivities)
      .values(rows.activities.slice(i, i + 200))
      .onConflictDoUpdate({
        target: observatoryActivities.id,
        set: {
          state: sql`excluded.state`,
          attribution: sql`excluded.attribution`,
          agentId: sql`excluded.agent_id`,
          sourceUpdatedAt: sql`excluded.source_updated_at`,
          lastObservedAt: sql`excluded.last_observed_at`,
          title: sql`excluded.title`,
        },
      });
  }
  if (rows.candidates.length > 0) {
    await ctx.db
      .insert(observatoryCandidates)
      .values(rows.candidates.map((c) => ({ ...c, updatedAt: now })))
      .onConflictDoUpdate({ target: observatoryCandidates.id, set: { status: sql`excluded.status`, excerpt: sql`excluded.excerpt`, updatedAt: now } });
  }
  if (rows.agents.length > 0) {
    await ctx.db
      .insert(observatoryAgents)
      .values(rows.agents.map((a) => ({ ...a, updatedAt: now })))
      .onConflictDoUpdate({
        target: observatoryAgents.id,
        set: { name: sql`excluded.name`, historical: sql`excluded.historical`, lastActivityAt: sql`excluded.last_activity_at`, updatedAt: now },
      });
  }
  return { stats, cursor: rows.generatedAt, partial: Boolean(stats.partial) };
};
