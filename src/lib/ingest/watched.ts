import { and, asc, count, desc, gte, sql } from "drizzle-orm";
import reviewsFile from "../../../data/reviews.json";
import watchlistFile from "../../../data/watchlist.json";
import { githubEvents, watchedPrs, watchedRepos, watchedSignals } from "@/lib/db/schema";
import { GITHUB_AGENTS } from "@/lib/github/agents";
import { findSignatures } from "@/lib/github/signatures";
import { type Job, type JobContext, timeLeft } from "./common";
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

export const watchedJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { repos: 0, queries: 0, prs: 0, signals: 0 };
  let partial = false;
  await ensureWatchlist(ctx);

  const repos = await ctx.db
    .select()
    .from(watchedRepos)
    .orderBy(sql`${watchedRepos.lastPolledAt} asc nulls first`, asc(watchedRepos.repo))
    .limit(process.env.GITHUB_TOKEN ? 15 : 6);
  const now = new Date();

  try {
    for (const r of repos) {
      if (!canCall(ctx)) {
        partial = true;
        break;
      }
      const since = r.lastPolledAt ? new Date(r.lastPolledAt.getTime() - 48 * 3_600_000) : new Date(Date.now() - 30 * 86_400_000);
      let page = 1;
      let lastPrAt: Date | null = r.lastPrAt;
      while (page <= 3 && canCall(ctx)) {
        const body = await search(`repo:${r.repo} is:pr updated:>=${since.toISOString().slice(0, 10)}`, {
          sort: "updated",
          order: "desc",
          per_page: "100",
          page: String(page),
        });
        stats.queries = (stats.queries as number) + 1;
        const items = body.items ?? [];
        const records = items.map((i) => prRecord(i, r.repo, now)).filter((x): x is NonNullable<typeof x> => x !== null);
        if (records.length > 0) {
          await ctx.db
            .insert(watchedPrs)
            .values(records.map((x) => x.pr))
            .onConflictDoUpdate({
              target: watchedPrs.id,
              set: {
                state: sql`excluded.state`,
                sourceUpdatedAt: sql`excluded.source_updated_at`,
                lastObservedAt: sql`excluded.last_observed_at`,
                title: sql`excluded.title`,
              },
            });
          const sigs = records.flatMap((x) => x.signals);
          if (sigs.length > 0) {
            await ctx.db.insert(watchedSignals).values(sigs).onConflictDoNothing();
            stats.signals = (stats.signals as number) + sigs.length;
          }
          stats.prs = (stats.prs as number) + records.length;
          for (const x of records) if (!lastPrAt || x.pr.createdAt > lastPrAt) lastPrAt = x.pr.createdAt;
        }
        if (items.length < 100) break;
        page++;
      }
      const [c] = await ctx.db
        .select({ c: count() })
        .from(watchedPrs)
        .where(and(sql`${watchedPrs.repository} = ${r.repo}`, gte(watchedPrs.createdAt, new Date(Date.now() - 30 * 86_400_000))));
      await ctx.db
        .update(watchedRepos)
        .set({ lastPolledAt: now, lastPrAt, prCount30d: Number(c?.c ?? 0) })
        .where(sql`${watchedRepos.repo} = ${r.repo}`);
      stats.repos = (stats.repos as number) + 1;
    }
  } catch (err) {
    if (err instanceof RateLimited) {
      stats.rateLimitedUntil = new Date(err.resetAt).toISOString();
      partial = true;
    } else {
      throw err;
    }
  }

  stats.reviewsApplied = await applyReviews(ctx);
  stats.gapMs = gapMs();
  if (timeLeft(ctx) < 0) partial = true;
  return { stats, partial };
};
