import { inArray, sql } from "drizzle-orm";
import { osmChangesets, osmDaily } from "@/lib/db/schema";
import { dayOf } from "@/lib/format";
import { classifyOsm, osmEditorLabel } from "@/lib/osm/classify";
import { fetchJson, type Job, lastCursor, timeLeft } from "./common";

const API = "https://api.openstreetmap.org/api/0.6/changesets.json";

interface Changeset {
  id: number;
  created_at: string;
  closed_at?: string;
  open: boolean;
  changes_count?: number;
  user?: string;
  uid?: number;
  tags?: Record<string, string>;
}

/**
 * Samples recently closed changesets (newest first, 100 per page) and keeps the
 * AI-assisted and bot ones. Counts everything sampled so a share can be shown.
 */
export const osmJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { pages: 0, sampled: 0, ai: 0 };
  let partial = false;
  const cursor = await lastCursor(ctx.db, "osm");
  const minTs = cursor ? new Date(cursor).getTime() : Date.now() - 6 * 3_600_000;
  let newest: string | null = cursor;
  let before: string | null = null;
  const daily = new Map<string, { sampled: number; ai: number; byEditor: Record<string, number> }>();

  for (let page = 0; page < 8; page++) {
    if (timeLeft(ctx) < 10_000) {
      partial = true;
      break;
    }
    const qs = new URLSearchParams({ limit: "100", closed: "true" });
    if (before) qs.set("time", `2000-01-01T00:00:00Z,${before}`);
    const { status, body } = await fetchJson<{ changesets?: Changeset[] }>(`${API}?${qs}`);
    if (status !== 200 || !body?.changesets) throw new Error(`osm changesets ${status}`);
    stats.pages = (stats.pages as number) + 1;
    const sets = body.changesets;
    if (sets.length === 0) break;

    const fresh = sets.filter((c) => new Date(c.closed_at ?? c.created_at).getTime() > minTs);
    const aiRows = [];
    for (const c of fresh) {
      const ts = c.closed_at ?? c.created_at;
      const day = dayOf(new Date(ts));
      const d = daily.get(day) ?? { sampled: 0, ai: 0, byEditor: {} };
      d.sampled++;
      const kind = classifyOsm(c.tags, c.user);
      if (kind) {
        d.ai++;
        const editor = osmEditorLabel(c.tags?.created_by);
        d.byEditor[editor] = (d.byEditor[editor] ?? 0) + 1;
        aiRows.push({
          id: c.id,
          ts: new Date(ts),
          user: c.user ?? null,
          editor,
          aiKind: kind,
          changes: c.changes_count ?? null,
          comment: (c.tags?.comment ?? "").slice(0, 300) || null,
          url: `https://www.openstreetmap.org/changeset/${c.id}`,
        });
      }
      daily.set(day, d);
      if (!newest || ts > newest) newest = ts;
    }
    stats.sampled = (stats.sampled as number) + fresh.length;
    if (aiRows.length > 0) {
      const existing = new Set((await ctx.db.select({ id: osmChangesets.id }).from(osmChangesets).where(inArray(osmChangesets.id, aiRows.map((r) => r.id)))).map((r) => r.id));
      const rows = aiRows.filter((r) => !existing.has(r.id));
      if (rows.length > 0) await ctx.db.insert(osmChangesets).values(rows).onConflictDoNothing();
      stats.ai = (stats.ai as number) + rows.length;
    }
    if (fresh.length < sets.length) break; // reached already-seen changesets
    const oldest = sets[sets.length - 1];
    before = oldest.closed_at ?? oldest.created_at;
  }

  for (const [day, d] of daily) {
    await ctx.db
      .insert(osmDaily)
      .values({ day, sampled: d.sampled, aiAssisted: d.ai, byEditor: d.byEditor })
      .onConflictDoUpdate({
        target: osmDaily.day,
        set: {
          sampled: sql`${osmDaily.sampled} + excluded.sampled`,
          aiAssisted: sql`${osmDaily.aiAssisted} + excluded.ai_assisted`,
          byEditor: sql`coalesce(${osmDaily.byEditor}, '{}'::jsonb) || excluded.by_editor`,
        },
      });
  }
  stats.days = daily.size;
  return { stats, cursor: newest, partial };
};
