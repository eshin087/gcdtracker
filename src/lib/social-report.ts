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
export function sampleDays(endDay: string, count = 28): string[] {
  const start = Date.parse(endDay + "T00:00:00Z");
  return Array.from({ length: Math.max(1, Math.min(90, count)) }, (_,i) => i).map((_,i,arr) =>
    new Date(start - (arr.length - 1 - i) * 86400000).toISOString().slice(0,10));
}
