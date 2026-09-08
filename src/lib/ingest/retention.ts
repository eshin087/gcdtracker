import { sql } from "drizzle-orm";
import { daysAgo } from "@/lib/format";
import { type Job, timeLeft } from "./common";
import { resultRows } from "./state";

/** Bounded batches avoid returning every deleted ID or one unbounded delete transaction. */
export const retentionJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = {};
  const jobs: Array<{ table: string; column: string; cutoff: string }> = [
    { table: "visits", column: "ts", cutoff: daysAgo(180) },
    { table: "wiki_edits", column: "ts", cutoff: daysAgo(180) },
    { table: "github_events", column: "created_at", cutoff: daysAgo(90) },
    { table: "forum_posts", column: "ts", cutoff: daysAgo(180) },
    { table: "ingest_runs", column: "started_at", cutoff: daysAgo(30) },
    { table: "osm_sample_seen", column: "day", cutoff: daysAgo(7) },
  ];
  let batches = 0;
  for (const job of jobs) {
    let removed = 0;
    for (;;) {
      if (timeLeft(ctx) < 5000 || batches >= 50) return { stats: { ...stats, batches }, outcome: "partial" };
      const cutoff = job.column === "day" ? sql`${job.cutoff}::date` : sql`${job.cutoff + "T00:00:00Z"}::timestamptz`;
      const query = sql`with removed as (
        delete from ${sql.identifier(job.table)} where ctid in (
          select ctid from ${sql.identifier(job.table)} where ${sql.identifier(job.column)} < ${cutoff}
          order by ${sql.identifier(job.column)} limit 1000
        ) returning 1
      ) select count(*)::int as count from removed`;
      const result = await ctx.db.execute(query);
      const count = Number(resultRows<{ count: number }>(result)[0]?.count ?? 0);
      batches++;
      removed += count;
      stats[job.table] = removed;
      if (count < 1000) break;
    }
  }
  return { stats: { ...stats, batches }, outcome: "success" };
};
