import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "./db";
import { socialSamples } from "./db/schema";
import { cacheSummary } from "./query-cache";
import { publicSocialSample, sampleDays, type SocialReportData } from "./social-report";

async function querySocialReport(): Promise<SocialReportData> {
  const days = sampleDays(new Date().toISOString().slice(0,10));
  if (!db) return { days, samples: [], mode: "offline" };
  try {
    const rows = await db.select({
      platform: socialSamples.platform, day: socialSamples.day, collectionVersion: socialSamples.collectionVersion,
      startedAt: socialSamples.startedAt, finishedAt: socialSamples.finishedAt,
      sampledPosts: socialSamples.sampledPosts, aiDisclosurePosts: socialSamples.aiDisclosurePosts,
      automatedAccountPosts: socialSamples.automatedAccountPosts, scopes: socialSamples.scopes,
      outcome: socialSamples.outcome, coverage: socialSamples.coverage,
    }).from(socialSamples).where(and(eq(socialSamples.collectionVersion, 1), gte(socialSamples.day, days[0]),
      lte(socialSamples.day, days.at(-1)!))).orderBy(desc(socialSamples.day)).limit(56);
    const samples = rows.flatMap(row => { const value = publicSocialSample(row); return value ? [value] : []; });
    return { days, samples, mode: samples.length === rows.length ? "observed" : "unavailable" };
  } catch {
    // Missing migration / unavailable database stays visible, never represented as a zero sample.
    return { days, samples: [], mode: "unavailable" };
  }
}
export const getSocialReport = cacheSummary(querySocialReport, "social-report-v1");
