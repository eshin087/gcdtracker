import { lt } from "drizzle-orm";
import { forumPosts, githubEvents, ingestRuns, visits, wikiEdits } from "@/lib/db/schema";
import type { Job } from "./common";

const days = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Keeps the free Neon tier comfortably under its storage cap. */
export const retentionJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = {};
  stats.visits = (await ctx.db.delete(visits).where(lt(visits.ts, days(180))).returning({ id: visits.id })).length;
  stats.wikiEdits = (await ctx.db.delete(wikiEdits).where(lt(wikiEdits.ts, days(180))).returning({ id: wikiEdits.rcid })).length;
  stats.githubEvents = (await ctx.db.delete(githubEvents).where(lt(githubEvents.createdAt, days(90))).returning({ id: githubEvents.id })).length;
  stats.forumPosts = (await ctx.db.delete(forumPosts).where(lt(forumPosts.ts, days(180))).returning({ id: forumPosts.id })).length;
  stats.ingestRuns = (await ctx.db.delete(ingestRuns).where(lt(ingestRuns.startedAt, days(30))).returning({ id: ingestRuns.id })).length;
  return { stats };
};
