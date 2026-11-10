import { z } from "zod";
import { BLUESKY_SCOPE, MASTODON_ORIGINS, SOCIAL_PLATFORMS } from "./social-contract";

const instant = z.union([z.date(), z.iso.datetime({ offset: true })]).transform(v => new Date(v).toISOString());
const source = z.enum([BLUESKY_SCOPE, ...MASTODON_ORIGINS]);
const count = z.number().int().nonnegative().max(10000);
const publicCoverage = z.object({
  method: z.enum(["jetstream-v2-live-create-sample", "local-public-timeline-snapshot"]),
  representative: z.literal(false), disclosureLanguage: z.literal("en"),
  disclosureDefinition: z.literal("explicit-first-person-content-disclosure-v1"),
  attribution: z.literal("unverified-text-signals"),
  automatedAccountMeaning: z.enum(["not-observed", "self-designated-bot-not-necessarily-ai"]),
  includesReplies: z.literal(false), includesBoosts: z.literal(false),
  publisherFrom: instant.nullable(),
  publisherTo: instant.nullable(),
  maxRequests: count, maxRecords: count, maxBytes: z.number().int().nonnegative().max(1048576),
  requestedDurationMs: count,
  excludedRecords: count, invalidRecords: count, duplicateRecords: count,
  scopes: z.array(z.object({ scope: source, outcome: z.enum(["success", "failed"]), sampledPosts: count })).max(2),
});
const sample = z.object({
  platform: z.enum(SOCIAL_PLATFORMS), day: z.iso.date(), collectionVersion: z.literal(1),
  startedAt: instant, finishedAt: instant,
  sampledPosts: count, aiDisclosurePosts: count, automatedAccountPosts: count.nullable(),
  scopes: z.array(source).max(2), outcome: z.enum(["success", "partial"]), coverage: publicCoverage,
}).refine(s => s.aiDisclosurePosts <= s.sampledPosts && (s.platform === "bluesky" || s.automatedAccountPosts !== null && s.automatedAccountPosts <= s.sampledPosts)
  && s.finishedAt >= s.startedAt);
export type PublicSocialSample = z.infer<typeof sample>;
/** Explicit nested field allowlists: private run state and future raw fields never escape. */
export function publicSocialSample(row: unknown): PublicSocialSample | null {
  const result = sample.safeParse(row);
  return result.success ? { ...result.data, automatedAccountPosts: result.data.platform === "bluesky" ? null : result.data.automatedAccountPosts } : null;
}
export interface SocialReportData {
  mode: "observed" | "offline" | "unavailable" | "demo";
  days: string[];
  samples: PublicSocialSample[];
}
export interface PooledDisclosure {
  platform: PublicSocialSample["platform"];
  /** UTC dates with a stored sample, not calendar days in the window. */
  sampleDays: number;
  sampledPosts: number;
  aiDisclosurePosts: number;
  firstDay: string;
  lastDay: string;
}
/**
 * Adds up every stored sample per platform so a rate is read against its whole sample size
 * rather than one day's. Days without a sample are not counted as zeros.
 */
export function pooledDisclosure(samples: PublicSocialSample[]): PooledDisclosure[] {
  const out = new Map<string, PooledDisclosure>();
  for (const s of samples) {
    const p = out.get(s.platform) ?? { platform: s.platform, sampleDays: 0, sampledPosts: 0, aiDisclosurePosts: 0, firstDay: s.day, lastDay: s.day };
    p.sampleDays++; p.sampledPosts += s.sampledPosts; p.aiDisclosurePosts += s.aiDisclosurePosts;
    if (s.day < p.firstDay) p.firstDay = s.day;
    if (s.day > p.lastDay) p.lastDay = s.day;
    out.set(s.platform, p);
  }
  return SOCIAL_PLATFORMS.flatMap(platform => out.get(platform) ?? []);
}
export function sampleDays(endDay: string, count = 28): string[] {
  const start = Date.parse(endDay + "T00:00:00Z");
  return Array.from({ length: Math.max(1, Math.min(90, count)) }, (_,i) => i).map((_,i,arr) =>
    new Date(start - (arr.length - 1 - i) * 86400000).toISOString().slice(0,10));
}
