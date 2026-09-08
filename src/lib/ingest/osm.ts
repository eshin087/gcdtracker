import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { dayOf } from "@/lib/format";
import { classifyOsm, osmEditorLabel } from "@/lib/osm/classify";
import { fetchJson, type Job, timeLeft } from "./common";
import { advisoryLocks, resultRows } from "./state";

const API = "https://api.openstreetmap.org/api/0.6/changesets.json";
export const OSM_COLLECTION_VERSION = 2;
export const OSM_LOOKBACK_MS = 48 * 3_600_000;
const MAX_PAGES = 8;

export interface Changeset {
  id: number; created_at: string; closed_at?: string; open: boolean;
  changes_count?: number; user?: string; tags?: Record<string, string>;
}
export interface OsmSample {
  id: number; created_at: string; closed_at: string; day: string;
  ai_kind: string | null; editor: string | null; user: string | null;
  changes: number | null; comment: string | null; url: string;
}

/** This is a capped recent-creation sample, not an exhaustive feed of closures. */
export function osmSample(c: Changeset, from: Date, to: Date): OsmSample | null {
  const created = Date.parse(c.created_at);
  const closed = Date.parse(c.closed_at ?? "");
  if (!Number.isSafeInteger(c.id) || c.id <= 0 || !Number.isFinite(created) || !Number.isFinite(closed)) throw new Error("invalid OSM changeset");
  if (c.open || created < from.getTime() || created >= to.getTime() || closed < created || closed > to.getTime()) return null;
  const kind = classifyOsm(c.tags, c.user);
  return {
    id: c.id, created_at: new Date(created).toISOString(), closed_at: new Date(closed).toISOString(), day: dayOf(new Date(closed)),
    ai_kind: kind, editor: kind ? osmEditorLabel(c.tags?.created_by) : null, user: c.user?.slice(0, 200) ?? null,
    changes: Number.isSafeInteger(c.changes_count) && c.changes_count! >= 0 ? c.changes_count! : null,
    comment: c.tags?.comment?.slice(0, 300) || null, url: `https://www.openstreetmap.org/changeset/${c.id}`,
  };
}

export function osmPageStatements(records: OsmSample[]): SQL[] {
  if (!records.length) return [];
  const payload = JSON.stringify(records);
  const days = [...new Set(records.map((r) => r.day))];
  return [
    ...advisoryLocks(73142, days),
    sql`insert into osm_sample_seen (id, created_at, closed_at, day, ai_kind, editor)
      select id, created_at, closed_at, day, ai_kind, editor
      from jsonb_to_recordset(${payload}::jsonb) as r(id bigint, created_at timestamptz, closed_at timestamptz, day date, ai_kind text, editor text)
      on conflict (id) do nothing returning id, ai_kind`,
    sql`insert into osm_changesets (id, collection_version, ts, "user", editor, ai_kind, changes, comment, url)
      select id, 2, closed_at, "user", editor, ai_kind, changes, comment, url
      from jsonb_to_recordset(${payload}::jsonb) as r(id bigint, closed_at timestamptz, "user" text, editor text, ai_kind text, changes integer, comment text, url text)
      where ai_kind is not null
      on conflict (id) do update set collection_version = 2, ts = excluded.ts, "user" = excluded."user",
        editor = excluded.editor, ai_kind = excluded.ai_kind, changes = excluded.changes, comment = excluded.comment, url = excluded.url`,
    sql`insert into osm_daily (day, collection_version, sampled, ai_assisted, by_editor)
      select s.day, 2, count(*)::int, count(*) filter (where s.ai_kind is not null)::int,
        (select coalesce(jsonb_object_agg(e.editor, e.n), '{}'::jsonb)
         from (select coalesce(editor, 'unknown') as editor, count(*)::int as n from osm_sample_seen
               where day = s.day and ai_kind is not null group by coalesce(editor, 'unknown')) e)
      from osm_sample_seen s where s.day in (${sql.join(days.map((day) => sql`${day}::date`), sql`, `)}) group by s.day
      on conflict (day, collection_version) do update set sampled = excluded.sampled, ai_assisted = excluded.ai_assisted, by_editor = excluded.by_editor`,
  ];
}

export async function commitOsmSamples(db: Db, records: OsmSample[]): Promise<{ inserted: number; ai: number }> {
  if (!records.length) return { inserted: 0, ai: 0 };
  const unique = [...new Map(records.map((r) => [r.id, r])).values()];
  const locks = new Set(unique.map((r) => r.day)).size;
  const queries = osmPageStatements(unique).map((q) => db.execute(q));
  const results = await db.batch(queries as [typeof queries[number], ...typeof queries]);
  const added = resultRows<{ id: number; ai_kind: string | null }>(results[locks]);
  return { inserted: added.length, ai: added.filter((r) => r.ai_kind !== null).length };
}

export const osmJob: Job = async (ctx) => {
  const until = new Date();
  const from = new Date(until.getTime() - OSM_LOOKBACK_MS);
  const stats: Record<string, unknown> = { version: 2, windowFrom: from.toISOString(), windowTo: until.toISOString(), pages: 0, observed: 0, inserted: 0, ai: 0, cappedSample: true };
  let before = until;
  const seen = new Set<number>();
  for (let page = 0; page < MAX_PAGES; page++) {
    if (timeLeft(ctx) < 12_000) return { stats, outcome: "partial" };
    const qs = new URLSearchParams({ limit: "100", closed: "true", from: from.toISOString(), to: before.toISOString() });
    const { status, body } = await fetchJson<{ changesets?: Changeset[] }>(`${API}?${qs}`, {}, Math.min(20_000, timeLeft(ctx) - 3000));
    if (status !== 200 || !Array.isArray(body?.changesets)) throw new Error(`osm changesets ${status}`);
    stats.pages = Number(stats.pages) + 1;
    if (!body.changesets.length) return { stats, outcome: "success" };
    const records = body.changesets.map((c) => osmSample(c, from, until)).filter((r): r is OsmSample => r !== null).filter((r) => !seen.has(r.id));
    records.forEach((r) => seen.add(r.id));
    const committed = await commitOsmSamples(ctx.db, records);
    stats.observed = Number(stats.observed) + records.length;
    stats.inserted = Number(stats.inserted) + committed.inserted;
    stats.ai = Number(stats.ai) + committed.ai;
    const oldest = Math.min(...body.changesets.map((c) => Date.parse(c.created_at)));
    stats.sampledCreationFrom = new Date(oldest).toISOString();
    if (body.changesets.length < 100) return { stats, outcome: "success" };
    // Include the boundary instant on the next page. Saturated equal timestamps are
    // reported as a capped sample instead of silently stepping over unseen rows.
    const nextBefore = new Date(oldest + 1);
    if (!records.length || nextBefore >= before) return { stats: { ...stats, boundaryLimited: true }, outcome: "partial" };
    before = nextBefore;
  }
  return { stats: { ...stats, pageLimitReached: true }, outcome: "partial" };
};
