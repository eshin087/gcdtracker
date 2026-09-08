import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { ghArchiveCompleted } from "@/lib/db/schema";
import type { Job } from "./common";
import { advisoryLocks } from "./state";

export const GH_ARCHIVE = { site: "https://www.gharchive.org", files: "https://data.gharchive.org" } as const;
export const GH_ARCHIVE_INGEST_VERSION = 2;
export const ARCHIVE_TOTAL_KEYS = ["events", "prs_opened", "prs_merged", "pushes", "pushes_with_commits", "commits", "prs_with_body"] as const;
const KINDS = new Set(["total", "agent-prs", "agent-merged", "pr-signature", "commit-signature"]);
export interface HourRecord { hour: string; rows: Array<{ kind: string; key: string; value: number }> }

export function validArchiveHour(hour: unknown): hour is string {
  if (typeof hour !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hour)) return false;
  const date = new Date(`${hour}:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 13) === hour;
}

export function hoursBetween(from: string, to: string): string[] {
  if (!validArchiveHour(from) || !validArchiveHour(to) || from > to) throw new Error("expected a valid UTC hour range");
  const start = Date.parse(`${from}:00:00Z`), end = Date.parse(`${to}:00:00Z`);
  const length = (end - start) / 3_600_000 + 1;
  if (length > 20_000) throw new Error("range too large");
  return Array.from({ length }, (_, i) => new Date(start + i * 3_600_000).toISOString().slice(0, 13));
}

/** Reject an entire incomplete or malformed batch before any database changes. */
export function parseArchivePayload(payload: string): HourRecord[] {
  const body: unknown = JSON.parse(payload);
  if (!body || typeof body !== "object" || !("ingestVersion" in body) || body.ingestVersion !== GH_ARCHIVE_INGEST_VERSION ||
      !("hours" in body) || !Array.isArray(body.hours) || !body.hours.length || body.hours.length > 24) throw new Error("expected ingestVersion:2 and 1..24 complete hours");
  const seen = new Set<string>();
  for (const h of body.hours) {
    if (!h || !validArchiveHour(h.hour) || seen.has(h.hour) || !Array.isArray(h.rows) || h.rows.length > 500) throw new Error("invalid or repeated archive hour");
    seen.add(h.hour);
    const rowKeys = new Set<string>();
    const totals = new Map<string, number>();
    let agentPrs = 0, agentMerged = 0, signatures = 0;
    for (const r of h.rows) {
      if (!r || !KINDS.has(r.kind) || typeof r.key !== "string" || !/^[a-z0-9_-]{1,80}$/.test(r.key) ||
          !Number.isInteger(r.value) || r.value < 0 || r.value > 2_147_483_647) throw new Error("invalid archive count");
      const key = `${r.kind}|${r.key}`;
      if (rowKeys.has(key)) throw new Error("duplicate archive metric");
      rowKeys.add(key);
      if (r.kind === "total") totals.set(r.key, r.value);
      if (r.kind === "agent-prs") agentPrs += r.value;
      if (r.kind === "agent-merged") agentMerged += r.value;
      if (r.kind === "pr-signature") signatures += r.value;
    }
    if (totals.size !== ARCHIVE_TOTAL_KEYS.length || ARCHIVE_TOTAL_KEYS.some((k) => !totals.has(k))) throw new Error("hour is missing required totals");
    if (agentPrs + signatures > totals.get("prs_opened")! || agentMerged > totals.get("prs_merged")! ||
        totals.get("prs_opened")! > totals.get("events")! || totals.get("prs_merged")! > totals.get("events")! ||
        totals.get("pushes_with_commits")! > totals.get("pushes")! || totals.get("prs_with_body")! > totals.get("prs_opened")!) throw new Error("inconsistent archive totals");
  }
  return body.hours as HourRecord[];
}

/** Sorted day locks serialize overlapping shards; snapshots/rollups/markers commit together. */
export function archiveReplacementStatements(hours: HourRecord[]): SQL[] {
  const days = [...new Set(hours.map((h) => h.hour.slice(0, 10)))].sort();
  const dayList = sql.join(days.map((d) => sql`${d}::date`), sql`, `);
  const hourList = sql.join(hours.map((h) => sql`${h.hour}`), sql`, `);
  const rows = hours.flatMap((h) => h.rows.map((r) => ({ hour: h.hour, ...r })));
  return [
    ...advisoryLocks(73143, days),
    sql`delete from gh_archive_hourly where hour in (${hourList})`,
    sql`insert into gh_archive_hourly (hour, kind, key, value, fetched_at)
      select hour, kind, key, value, now() from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(hour text, kind text, key text, value integer)`,
    sql`delete from gh_archive_daily where day in (${dayList})`,
    sql`insert into gh_archive_daily (day, kind, key, value, hours)
      select left(h.hour, 10)::date, h.kind, h.key, sum(h.value)::int, c.hours
      from gh_archive_hourly h
      join (select left(hour, 10) as day, count(distinct hour)::int as hours from gh_archive_hourly
        where kind = 'total' and key = 'events' and left(hour, 10)::date in (${dayList}) group by left(hour, 10)) c on c.day = left(h.hour, 10)
      where left(h.hour, 10)::date in (${dayList}) group by left(h.hour, 10), h.kind, h.key, c.hours`,
    sql`insert into gh_archive_completed (hour, ingest_version, completed_at)
      select value, 2, now() from jsonb_array_elements_text(${JSON.stringify(hours.map((h) => h.hour))}::jsonb)
      on conflict (hour) do update set ingest_version = 2, completed_at = excluded.completed_at`,
  ];
}

export const ghArchiveJob: Job = async (ctx) => {
  if (!ctx.payload) {
    const from = ctx.query?.get("from") ?? "", to = ctx.query?.get("to") ?? "";
    const wanted = hoursBetween(from, to);
    const present = await ctx.db.select({ hour: ghArchiveCompleted.hour }).from(ghArchiveCompleted)
      .where(and(eq(ghArchiveCompleted.ingestVersion, GH_ARCHIVE_INGEST_VERSION), gte(ghArchiveCompleted.hour, from), lte(ghArchiveCompleted.hour, to)));
    const have = new Set(present.map((p) => p.hour));
    return { stats: { ingestVersion: 2, from, to, wanted: wanted.length, present: have.size, missing: wanted.filter((h) => !have.has(h)) }, outcome: "success" };
  }
  const hours = parseArchivePayload(ctx.payload);
  const queries = archiveReplacementStatements(hours).map((q) => ctx.db.execute(q));
  await ctx.db.batch(queries as [typeof queries[number], ...typeof queries]);
  const names = hours.map((h) => h.hour).sort();
  return { stats: { ingestVersion: 2, hours: hours.length, rows: hours.reduce((n, h) => n + h.rows.length, 0), first: names[0], last: names.at(-1) }, outcome: "success" };
};
