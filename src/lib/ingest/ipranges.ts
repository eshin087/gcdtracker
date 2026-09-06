import { and, eq, notInArray, sql } from "drizzle-orm";
import { IP_SOURCES } from "@/lib/agents/catalog";
import { ipRanges } from "@/lib/db/schema";
import { fetchJson, type Job, timeLeft } from "./common";

interface PrefixList {
  creationTime?: string;
  prefixes?: Array<{ ipv4Prefix?: string; ipv6Prefix?: string }>;
}

export function parsePrefixes(body: PrefixList | null): string[] {
  if (!body?.prefixes) return [];
  const out: string[] = [];
  for (const p of body.prefixes) {
    const v = p.ipv4Prefix ?? p.ipv6Prefix;
    if (v && /^[0-9a-fA-F.:]+\/\d{1,3}$/.test(v)) out.push(v);
  }
  return [...new Set(out)];
}

/** Refresh every published IP-range list. Stale rows are removed only after a successful fetch. */
export const ipRangesJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = {};
  let failures = 0;
  for (const src of IP_SOURCES) {
    if (timeLeft(ctx) < 5_000) {
      stats.partial = true;
      break;
    }
    try {
      const { status, body } = await fetchJson<PrefixList>(src.url);
      const cidrs = parsePrefixes(body);
      if (status !== 200 || cidrs.length === 0) {
        stats[src.key] = `skipped (${status}, ${cidrs.length} prefixes)`;
        failures++;
        continue;
      }
      const now = new Date();
      await ctx.db
        .insert(ipRanges)
        .values(cidrs.map((cidr) => ({ source: src.key, operator: src.operator, cidr, fetchedAt: now })))
        .onConflictDoUpdate({ target: [ipRanges.source, ipRanges.cidr], set: { fetchedAt: sql`excluded.fetched_at` } });
      await ctx.db.delete(ipRanges).where(and(eq(ipRanges.source, src.key), notInArray(ipRanges.cidr, cidrs)));
      stats[src.key] = cidrs.length;
    } catch (err) {
      failures++;
      stats[src.key] = `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 120);
    }
  }
  stats.failures = failures;
  return { stats };
};
