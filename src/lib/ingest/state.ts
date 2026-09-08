import { eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { collectorState } from "@/lib/db/schema";

export interface StateSnapshot<T> { state: T; revision: number }

/** Initializes a durable state row once, then returns its current revision. */
export async function readCollectorState<T extends Record<string, unknown>>(db: Db, key: string, fallback: T): Promise<StateSnapshot<T>> {
  await db.insert(collectorState).values({ key, state: fallback }).onConflictDoNothing();
  const [row] = await db.select().from(collectorState).where(eq(collectorState.key, key));
  if (!row) throw new Error("collector state missing after initialization");
  return { state: row.state as T, revision: row.revision };
}

export function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) return (result as { rows: T[] }).rows;
  return [];
}

/** Locks are held only for a finite HTTP transaction, never during upstream fetches. */
export function advisoryLocks(namespace: number, keys: string[]): SQL[] {
  return [...new Set(keys)].sort().map((key) => sql`select pg_advisory_xact_lock(${namespace}, hashtext(${key}))`);
}

/**
 * Atomically commit page data and progress. Each supplied write MUST include guard in
 * its WHERE clause (or INSERT ... SELECT ... WHERE guard). A stale reader commits no
 * data and returns false. HTTP batches execute with Postgres READ COMMITTED snapshots.
 */
export async function commitCollectorState<T extends Record<string, unknown>>(
  db: Db,
  key: string,
  snapshot: StateSnapshot<T>,
  next: T,
  writes: (guard: SQL) => SQL[] = () => [],
): Promise<boolean> {
  const guard = sql`exists (select 1 from collector_state where key = ${key} and revision = ${snapshot.revision})`;
  const queries = [
    ...advisoryLocks(73141, [key]),
    ...writes(guard),
    sql`update collector_state set state = ${JSON.stringify(next)}::jsonb, revision = revision + 1, updated_at = now()
        where key = ${key} and revision = ${snapshot.revision} returning revision`,
  ].map((q) => db.execute(q));
  const results = await db.batch(queries as [typeof queries[number], ...typeof queries]);
  return resultRows(results.at(-1)).length === 1;
}
