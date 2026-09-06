import { and, gte, inArray, lte, sql } from "drizzle-orm";
import { ghArchiveDaily, ghArchiveHourly } from "@/lib/db/schema";
import type { Job } from "./common";

export const GH_ARCHIVE = { site: "https://www.gharchive.org", files: "https://data.gharchive.org" } as const;

interface HourRecord {
  hour: string;
  rows: Array<{ kind: string; key: string; value: number }>;
}

const HOUR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}$/;

function hoursBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}:00:00Z`).getTime();
  for (let t = new Date(`${from}:00:00Z`).getTime(); t <= end; t += 3_600_000) out.push(new Date(t).toISOString().slice(0, 13));
  return out;
}

/**
 * Receives hourly GH Archive counts from the Actions worker (POST) and answers
 * "which hours are missing" (GET ?from=&to=) so backfills can resume anywhere.
 */
export const ghArchiveJob: Job = async (ctx) => {
  if (!ctx.payload) {
    const from = ctx.query?.get("from") ?? "";
    const to = ctx.query?.get("to") ?? "";
    if (!HOUR_RE.test(from) || !HOUR_RE.test(to)) throw new Error("expected ?from=YYYY-MM-DDTHH&to=YYYY-MM-DDTHH or a JSON body");
    const wanted = hoursBetween(from, to);
    if (wanted.length > 20_000) throw new Error("range too large");
    const present = await ctx.db
      .selectDistinct({ hour: ghArchiveHourly.hour })
      .from(ghArchiveHourly)
      .where(and(gte(ghArchiveHourly.hour, from), lte(ghArchiveHourly.hour, to)));
    const have = new Set(present.map((p) => p.hour));
    const missing = wanted.filter((h) => !have.has(h));
    return { stats: { from, to, wanted: wanted.length, present: have.size, missing } };
  }

  let body: { hours?: HourRecord[] };
  try {
    body = JSON.parse(ctx.payload) as { hours?: HourRecord[] };
  } catch {
    throw new Error("body is not JSON");
  }
  const hours = (body.hours ?? []).filter((h) => HOUR_RE.test(h.hour) && Array.isArray(h.rows));
  if (hours.length === 0) return { stats: { hours: 0 } };

  const rows = hours.flatMap((h) => h.rows.filter((r) => typeof r.kind === "string" && typeof r.key === "string" && Number.isFinite(r.value)).map((r) => ({ hour: h.hour, kind: r.kind.slice(0, 40), key: r.key.slice(0, 80), value: Math.round(r.value) })));
  for (let i = 0; i < rows.length; i += 500) {
    await ctx.db
      .insert(ghArchiveHourly)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({ target: [ghArchiveHourly.hour, ghArchiveHourly.kind, ghArchiveHourly.key], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }

  // Roll the affected days up again from scratch so partial days stay consistent.
  const days = [...new Set(hours.map((h) => h.hour.slice(0, 10)))];
  const agg = await ctx.db
    .select({
      day: sql<string>`left(${ghArchiveHourly.hour}, 10)`,
      kind: ghArchiveHourly.kind,
      key: ghArchiveHourly.key,
      value: sql<number>`sum(${ghArchiveHourly.value})::int`,
      hours: sql<number>`count(distinct ${ghArchiveHourly.hour})::int`,
    })
    .from(ghArchiveHourly)
    .where(inArray(sql`left(${ghArchiveHourly.hour}, 10)`, days))
    .groupBy(sql`left(${ghArchiveHourly.hour}, 10)`, ghArchiveHourly.kind, ghArchiveHourly.key);
  // "hours" per (day, kind, key) counts only hours where that key appeared; the day's true
  // coverage is the number of hours with any row, carried by the total/events key.
  const coverage = new Map<string, number>();
  for (const a of agg) if (a.kind === "total" && a.key === "events") coverage.set(a.day, a.hours);
  const dailyRows = agg.map((a) => ({ day: a.day, kind: a.kind, key: a.key, value: a.value, hours: coverage.get(a.day) ?? a.hours }));
  for (let i = 0; i < dailyRows.length; i += 500) {
    await ctx.db
      .insert(ghArchiveDaily)
      .values(dailyRows.slice(i, i + 500))
      .onConflictDoUpdate({ target: [ghArchiveDaily.day, ghArchiveDaily.kind, ghArchiveDaily.key], set: { value: sql`excluded.value`, hours: sql`excluded.hours` } });
  }

  const first = hours.map((h) => h.hour).sort()[0];
  const last = hours.map((h) => h.hour).sort().at(-1);
  return { stats: { hours: hours.length, rows: rows.length, days: days.length, first, last }, cursor: last ?? null };
};
