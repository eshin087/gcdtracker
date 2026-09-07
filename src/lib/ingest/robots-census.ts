import { and, eq, sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import type { Job } from "./common";
import { ROBOTS_TOKENS } from "@/lib/robots/tokens";
export { ROBOTS_TOKENS };
export const ROBOTS_CENSUS_SOURCE = "cc-robots-v2";
export const ROBOTS_CENSUS = { site: "https://commoncrawl.org", index: "https://index.commoncrawl.org/collinfo.json" } as const;
interface CrawlRecord {
  id: string; date: string; files: number; sites: number; excluded: number; parserVersion: 2;
  tokens: Record<string, { mentioned: number; blocked: number }>;
}
export function validateCrawls(payload: string): CrawlRecord[] {
  const body = JSON.parse(payload);
  if (!Array.isArray(body.crawls) || body.crawls.length !== 1) throw new Error("submit exactly one complete crawl");
  for (const c of body.crawls) {
    if (c.parserVersion !== 2 || !/^CC-MAIN-\d{4}-\d{2}$/.test(c.id) || !/^\d{4}-\d{2}-\d{2}$/.test(c.date) ||
      !Number.isFinite(Date.parse(c.date)) || new Date(c.date).toISOString().slice(0, 10) !== c.date ||
      !Number.isSafeInteger(c.sites) || c.sites <= 0 || !Number.isSafeInteger(c.files) || c.files < 1 || c.files > 100 ||
      !Number.isSafeInteger(c.excluded) || c.excluded < 0) throw new Error("invalid or legacy crawl payload");
    for (const token of ROBOTS_TOKENS) {
      const t = c.tokens?.[token];
      if (!t || !Number.isSafeInteger(t.mentioned) || !Number.isSafeInteger(t.blocked) ||
        t.blocked < 0 || t.mentioned < t.blocked || t.mentioned > c.sites) throw new Error("invalid census counts");
    }
  }
  return body.crawls;
}
/** Version 2 is kept separate from legacy counts; a sample is replaced atomically. */
export const robotsCensusJob: Job = async (ctx) => {
  if (!ctx.payload) {
    const rows = await ctx.db.select({ period: externalSeries.period }).from(externalSeries)
      .where(and(eq(externalSeries.source, ROBOTS_CENSUS_SOURCE), eq(externalSeries.series, "_sites")));
    return { stats: { done: rows.map((r) => r.period).sort(), parserVersion: 2 } };
  }
  const crawls = validateCrawls(ctx.payload);
  for (const c of crawls) {
    const rows = [
      { source: ROBOTS_CENSUS_SOURCE, series: "_sites", period: c.date, value: c.sites },
      { source: ROBOTS_CENSUS_SOURCE, series: "_files", period: c.date, value: c.files },
      { source: ROBOTS_CENSUS_SOURCE, series: "_excluded", period: c.date, value: c.excluded },
      ...ROBOTS_TOKENS.flatMap((token) => [
        { source: ROBOTS_CENSUS_SOURCE, series: token + ":mentioned", period: c.date, value: c.tokens[token].mentioned },
        { source: ROBOTS_CENSUS_SOURCE, series: token + ":blocked", period: c.date, value: c.tokens[token].blocked },
      ]),
    ];
    await ctx.db.batch([
      ctx.db.execute(sql`select pg_advisory_xact_lock(hashtext(${"robots-v2:" + c.date}))`),
      ctx.db.delete(externalSeries).where(and(eq(externalSeries.source, ROBOTS_CENSUS_SOURCE), eq(externalSeries.period, c.date))),
      ctx.db.insert(externalSeries).values(rows),
    ]);
  }
  return { stats: { crawls: crawls.map((c) => c.id), parserVersion: 2 }, cursor: crawls[0].date };
};
