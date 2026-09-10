import { sql } from "drizzle-orm";
import { agentSightings, externalSeries } from "@/lib/db/schema";
import type { Job } from "./common";

interface Payload {
  source?: string;
  tokens?: Array<{ token: string; firstSeen: string }>;
  newPerMonth?: Record<string, number>;
}

/**
 * Receives first-listed dates for every ai.robots.txt token from the Actions worker
 * Historical payloads date each sighting by when the community list first
 * carried the token rather than when this site first read the list, and stores new
 * identities per month as a series.
 */
export const aiRobotsHistoryJob: Job = async (ctx) => {
  if (!ctx.payload) throw new Error("expects a historical worker JSON payload");
  let body: Payload;
  try {
    body = JSON.parse(ctx.payload) as Payload;
  } catch {
    throw new Error("body is not JSON");
  }
  const tokens = (body.tokens ?? []).filter((t) => typeof t.token === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.firstSeen));
  let updated = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const slice = tokens.slice(i, i + 100);
    const values = sql.join(
      slice.map((t) => sql`(${t.token.toLowerCase()}, ${t.firstSeen}::timestamptz)`),
      sql`, `,
    );
    // Only ever move a sighting earlier: the list's history is the earliest evidence we hold.
    const res = await ctx.db.execute(sql`
      update ${agentSightings} as s set first_seen = v.first_seen
      from (values ${values}) as v(token, first_seen)
      where s.kind = 'ai-robots-txt' and lower(s.token) = v.token and s.first_seen > v.first_seen`);
    updated += Number((res as { rowCount?: number }).rowCount ?? 0);
  }
  const months = Object.entries(body.newPerMonth ?? {}).filter(([m, v]) => /^\d{4}-\d{2}$/.test(m) && Number.isFinite(v));
  if (months.length > 0) {
    await ctx.db
      .insert(externalSeries)
      .values(months.map(([period, value]) => ({ source: "ai-robots-history", series: "new-tokens", period, value: Number(value), lo: null, hi: null })))
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }
  return { stats: { tokens: tokens.length, updated, months: months.length }, cursor: tokens.map((t) => t.firstSeen).sort().at(-1) ?? null };
};
