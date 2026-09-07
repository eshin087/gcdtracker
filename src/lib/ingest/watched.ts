import { asc, count, desc, gte, sql, type SQL } from "drizzle-orm";
import reviewsFile from "../../../data/reviews.json";
import watchlistFile from "../../../data/watchlist.json";
import { githubEvents, watchedRepos, watchedSignals } from "@/lib/db/schema";
import { GITHUB_AGENTS } from "@/lib/github/agents";
import { findSignatures } from "@/lib/github/signatures";
import { type Job, type JobContext, timeLeft } from "./common";
import { readCollectorState, commitCollectorState } from "./state";
import { canCall, gapMs, RateLimited, search, type SearchItem } from "./github";

/**
 * Watched-repository collector. For a seed list plus auto-discovered repositories
 * it records every pull request opened by a known agent bot account (documented)
 * and every PR whose author names an AI tool in the body (self-disclosed candidate).
 */

const BOT_BY_ID = new Map(GITHUB_AGENTS.filter((a) => a.id !== undefined).map((a) => [a.id!, a]));
const AUTO_LIMIT = 25;

interface Review {
  id: string;
  status: "confirmed" | "dismissed" | "needs_evidence";
  reason?: string;
  reviewedAt?: string;
  evidenceUrls?: string[];
}

export function prRecord(item: SearchItem, repo: string, now: Date) {
  const bot = item.user ? BOT_BY_ID.get(item.user.id) : undefined;
  const hits = bot ? [] : findSignatures(`${item.title}\n${item.body ?? ""}`);
  if (!bot && hits.length === 0) return null;
  const id = `github-pr-${item.id}`;
  return {
    pr: {
      id,
      sourceId: repo,
      platform: "github",
      kind: "pull_request",
      title: item.title.slice(0, 300),
      url: item.html_url,
      actorLogin: item.user?.login ?? null,
      actorId: item.user?.id ?? null,
      agentId: bot?.key ?? null,
      attribution: bot ? "documented_agent" : "self_disclosed",
      repository: repo,
      state: item.state ?? null,
      createdAt: new Date(item.created_at),
      sourceUpdatedAt: item.updated_at ? new Date(item.updated_at) : null,
      lastObservedAt: now,
      evidence: bot
        ? `Public pull request author: ${item.user?.login} (GitHub user ID ${item.user?.id}), a registered ${bot.label} account.`
        : `Self-disclosure in the PR body: ${hits[0].excerpt}`,
      bodyExcerpt: (item.body ?? "").replace(/\s+/g, " ").trim().slice(0, 280) || null,
    },
    signals: hits.map((h) => ({ id: `${id}-${h.ruleId}`, activityId: id, ruleId: h.ruleId, excerpt: h.excerpt, url: item.html_url })),
  };
}

async function ensureWatchlist(ctx: JobContext): Promise<void> {
  const seeds = (watchlistFile as { repos: string[] }).repos;
  if (seeds.length > 0) {
    await ctx.db
      .insert(watchedRepos)
      .values(seeds.map((repo) => ({ repo, source: "seed" })))
      .onConflictDoNothing();
  }
  // Auto-discovery: repositories with the most agent PRs in our own sample feed.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const top = await ctx.db
    .select({ repo: githubEvents.repo, c: count() })
    .from(githubEvents)
    .where(gte(githubEvents.createdAt, since))
    .groupBy(githubEvents.repo)
    .orderBy(desc(count()))
    .limit(AUTO_LIMIT);
  if (top.length > 0) {
    await ctx.db
      .insert(watchedRepos)
      .values(top.map((t) => ({ repo: t.repo, source: "auto" })))
      .onConflictDoNothing();
  }
}

async function applyReviews(ctx: JobContext): Promise<number> {
  const reviews = (reviewsFile as { reviews: Review[] }).reviews;
  let applied = 0;
  for (const r of reviews) {
    const res = await ctx.db
      .update(watchedSignals)
      .set({ status: r.status, reason: r.reason ?? null, reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : new Date(), updatedAt: new Date() })
      .where(sql`${watchedSignals.id} = ${r.id} and ${watchedSignals.status} <> ${r.status}`)
      .returning({ id: watchedSignals.id });
    applied += res.length;
  }
  return applied;
}


export type WatchedWindow = { from: string; to: string; page?: number };
export type WatchedProgress = { windows: WatchedWindow[]; until: string };
const INITIAL_WATCHED: WatchedProgress = { windows: [], until: "" };
type PrRecord = NonNullable<ReturnType<typeof prRecord>>;

/** Never resume mutable search results by offset; each consumed window fits one page. */
export function splitWatchedWindow(window: WatchedWindow): WatchedWindow[] {
  const lo = Math.floor(Date.parse(window.from) / 1000), hi = Math.floor(Date.parse(window.to) / 1000);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) throw new Error("watched search exceeds 100 PRs in one timestamp; progress retained");
  const mid = Math.floor((lo + hi) / 2);
  const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
  return [{ from: iso(lo), to: iso(mid) }, { from: iso(mid + 1), to: iso(hi) }];
}
export function completeWatchedPage(total: number, items: SearchItem[]): void {
  if (!Number.isSafeInteger(total) || total < 0 || total > 100 || items.length !== total || new Set(items.map((item) => item.id)).size !== total) {
    throw new Error("watched search page is incomplete; progress retained");
  }
  for (const item of items) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.title !== "string" ||
        typeof item.html_url !== "string" || !Number.isFinite(Date.parse(item.created_at)) ||
        !item.updated_at || !Number.isFinite(Date.parse(item.updated_at))) throw new Error("malformed watched pull request");
  }
}

/** PR evidence, signals, summary and coverage checkpoint share one guarded transaction. */
export function watchedPageWrites(repo: string, records: PrRecord[], finishedUntil: string | null, now: Date, guard: SQL): SQL[] {
  const writes: SQL[] = [];
  if (records.length) {
    writes.push(sql`insert into watched_prs
      (id,source_id,platform,kind,title,url,actor_login,actor_id,agent_id,attribution,repository,state,created_at,source_updated_at,last_observed_at,evidence,body_excerpt)
      select r.id,r."sourceId",r.platform,r.kind,r.title,r.url,r."actorLogin",r."actorId",r."agentId",r.attribution,r.repository,r.state,
        r."createdAt",r."sourceUpdatedAt",r."lastObservedAt",r.evidence,r."bodyExcerpt"
      from jsonb_to_recordset(${JSON.stringify(records.map((record) => record.pr))}::jsonb) as r
        (id text,"sourceId" text,platform text,kind text,title text,url text,"actorLogin" text,"actorId" bigint,"agentId" text,attribution text,repository text,state text,
        "createdAt" timestamptz,"sourceUpdatedAt" timestamptz,"lastObservedAt" timestamptz,evidence text,"bodyExcerpt" text)
      where ${guard} on conflict(id) do update set state=excluded.state,source_updated_at=excluded.source_updated_at,
        last_observed_at=excluded.last_observed_at,title=excluded.title,evidence=excluded.evidence,body_excerpt=excluded.body_excerpt
      where watched_prs.source_updated_at is null or excluded.source_updated_at >= watched_prs.source_updated_at`);
    const signals = records.flatMap((record) => record.signals);
    if (signals.length) writes.push(sql`insert into watched_signals(id,activity_id,rule_id,excerpt,url)
      select r.id,r."activityId",r."ruleId",r.excerpt,r.url
      from jsonb_to_recordset(${JSON.stringify(signals)}::jsonb) as r(id text,"activityId" text,"ruleId" text,excerpt text,url text)
      where ${guard} on conflict(id) do nothing`);
  }
  writes.push(sql`update watched_repos set
    last_polled_at=case when ${finishedUntil}::timestamptz is null then last_polled_at else greatest(last_polled_at,${finishedUntil}::timestamptz) end,
    last_pr_at=(select max(created_at) from watched_prs where repository=${repo}),
    pr_count_30d=(select count(*)::int from watched_prs where repository=${repo} and created_at >= ${new Date(now.getTime()-30*86_400_000).toISOString()}::timestamptz)
    where repo=${repo} and ${guard}`);
  return writes;
}

export const watchedJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { repos: 0, queries: 0, prs: 0, signals: 0 };
  let partial = false;
  const failed: string[] = [];
  await ensureWatchlist(ctx);
  const wheel = await readCollectorState(ctx.db, "watched:rotation", { afterRepo: "" });
  // Rotate attempts separately from last_polled_at, which represents completed coverage.
  const limit = process.env.GITHUB_TOKEN ? 15 : 6;
  const after = await ctx.db.select().from(watchedRepos).where(sql`${watchedRepos.repo} > ${wheel.state.afterRepo}`).orderBy(asc(watchedRepos.repo)).limit(limit);
  const before = after.length < limit ? await ctx.db.select().from(watchedRepos).where(sql`${watchedRepos.repo} <= ${wheel.state.afterRepo}`).orderBy(asc(watchedRepos.repo)).limit(limit-after.length) : [];
  const repos = [...after,...before], now = new Date();
  for (const r of repos) {
    if (!canCall(ctx)) { partial = true; break; }
    let rateLimited = false;
    try {
      const since = r.lastPolledAt ? new Date(r.lastPolledAt.getTime() - 48 * 3_600_000) : new Date(now.getTime() - 30 * 86_400_000);
      const key = "watched:" + r.repo;
      let checkpoint = await readCollectorState(ctx.db, key, INITIAL_WATCHED);
      if (!checkpoint.state.windows.length) {
        const until = new Date(Math.floor(now.getTime()/1000)*1000).toISOString();
        if (!await commitCollectorState(ctx.db, key, checkpoint, { windows: [{ from: new Date(Math.floor(since.getTime()/1000)*1000).toISOString(), to: until }], until })) { partial = true; continue; }
        checkpoint = await readCollectorState(ctx.db, key, INITIAL_WATCHED);
      }
      let fetchedPages = 0;
      while (checkpoint.state.windows.length && fetchedPages < 3 && canCall(ctx)) {
        const window = checkpoint.state.windows[0];
        // Old page-number checkpoints restart the entire window safely.
        const body = await search(`repo:${r.repo} is:pr updated:${window.from}..${window.to}`, { sort: "updated", order: "desc", per_page: "100", page: "1" });
        stats.queries = Number(stats.queries) + 1; fetchedPages++;
        if (body.total_count! > 100) {
          const windows = [...splitWatchedWindow(window), ...checkpoint.state.windows.slice(1)];
          if (!await commitCollectorState(ctx.db, key, checkpoint, { ...checkpoint.state, windows })) { partial = true; break; }
        } else {
          const items = body.items!;
          completeWatchedPage(body.total_count!, items);
          const records = items.map((item) => prRecord(item, r.repo, now)).filter((record): record is PrRecord => record !== null);
          const windows = checkpoint.state.windows.slice(1);
          if (!await commitCollectorState(ctx.db, key, checkpoint, { ...checkpoint.state, windows },
            (guard) => watchedPageWrites(r.repo, records, windows.length ? null : checkpoint.state.until, now, guard))) { partial = true; break; }
          stats.prs = Number(stats.prs) + records.length;
          stats.signals = Number(stats.signals) + records.reduce((sum, record) => sum + record.signals.length, 0);
        }
        checkpoint = await readCollectorState(ctx.db, key, INITIAL_WATCHED);
      }
      stats.repos = Number(stats.repos) + 1;
      if (checkpoint.state.windows.length) partial = true;
    } catch (err) {
      if (err instanceof RateLimited) {
        stats.rateLimitedUntil = new Date(err.resetAt).toISOString();
        partial = true; rateLimited = true;
      } else failed.push(r.repo + ": " + (err instanceof Error ? err.message : "fetch failed"));
    } finally {
      const rotation = await readCollectorState(ctx.db, "watched:rotation", { afterRepo: "" });
      await commitCollectorState(ctx.db, "watched:rotation", rotation, { afterRepo: r.repo });
    }
    if (rateLimited) break;
  }
  stats.reviewsApplied = await applyReviews(ctx);
  stats.gapMs = gapMs();
  if (timeLeft(ctx) < 0) partial = true;
  return { stats: { ...stats, failed }, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
