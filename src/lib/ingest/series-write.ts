import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { commitCollectorState, readCollectorState } from "./state";
export { readCollectorState };
export interface SeriesRow { source: string; series: string; period: string; value: number }
/** Bounded SQL writes are guarded by the checkpoint revision in the same transaction. */
export function seriesWrites(rows: SeriesRow[], guard: SQL): SQL[] {
  const unique = new Map<string, SeriesRow>();
  for (const row of rows) {
    if (![row.source, row.series, row.period].every((v) => typeof v === "string" && v.length > 0) || !Number.isFinite(row.value)) throw new Error("invalid series observation");
    const key = JSON.stringify([row.source, row.series, row.period]);
    const previous = unique.get(key);
    if (previous && previous.value !== row.value) throw new Error("conflicting duplicate series observation");
    unique.set(key, row);
  }
  rows = [...unique.values()];
  const writes: SQL[] = [];
  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300);
    if (chunk.some((r) => !Number.isFinite(r.value))) throw new Error("non-finite series value");
    writes.push(sql`insert into external_series (source, series, period, value, fetched_at)
      select r.source, r.series, r.period, r.value, now()
      from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as r(source text, series text, period text, value double precision)
      where ${guard}
      on conflict (source, series, period) do update set value=excluded.value, fetched_at=excluded.fetched_at`);
  }
  return writes;
}
export async function commitSeries<T extends Record<string, unknown>>(
  db: Db, key: string, snapshot: { state: T; revision: number }, next: T, rows: SeriesRow[],
): Promise<boolean> {
  return commitCollectorState(db, key, snapshot, next, (guard) => seriesWrites(rows, guard));
}
