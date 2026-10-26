import { sampleDays, type SocialReportData } from "./social-report";
import type { ReadingSnapshot } from "@/components/ReadingReport";
import { BLUESKY_SCOPE, MASTODON_ORIGINS } from "./social-contract";

const days = sampleDays("2026-09-07");
export const DEMO_SOCIAL: SocialReportData = {
  mode: "demo", days,
  samples: days.flatMap((day, i) => (["bluesky", "mastodon"] as const).flatMap(platform => {
    if (i % 11 === 3) return [];
    const scopes: Array<typeof BLUESKY_SCOPE | typeof MASTODON_ORIGINS[number]> = platform === "bluesky" ? [BLUESKY_SCOPE] : [...MASTODON_ORIGINS];
    const sampledPosts = platform === "bluesky" ? 120 + i * 4 : 50 + i % 20;
    return [{
      platform, day, collectionVersion: 1 as const, startedAt: day + "T03:00:00.000Z", finishedAt: day + "T03:00:08.000Z",
      sampledPosts, aiDisclosurePosts: i % 7, automatedAccountPosts: platform === "bluesky" ? null : 5 + i % 8,
      scopes, outcome: i === 12 ? "partial" as const : "success" as const,
      coverage: {
        representative:false as const, disclosureLanguage:"en" as const, disclosureDefinition:"explicit-first-person-content-disclosure-v1" as const,
        attribution:"unverified-text-signals" as const, automatedAccountMeaning:platform === "bluesky" ? "not-observed" as const : "self-designated-bot-not-necessarily-ai" as const,
        includesReplies:false as const, includesBoosts:false as const,
        method: platform === "bluesky" ? "jetstream-v2-live-create-sample" as const : "local-public-timeline-snapshot" as const,
        publisherFrom: day + (platform === "bluesky" ? "T03:00:00.000Z" : "T02:40:00.000Z"), publisherTo: day + "T03:00:08.000Z",
        maxRequests: scopes.length, maxRecords: platform === "bluesky" ? 300 : 80, maxBytes: platform === "bluesky" ? 262144 : 524288,
        requestedDurationMs: platform === "bluesky" ? 8000 : 6000, excludedRecords: 3, invalidRecords: 0, duplicateRecords: 0,
        scopes: scopes.map(scope => ({ scope, outcome: "success" as const, sampledPosts: Math.floor(sampledPosts/scopes.length) })),
      },
    }];
  })),
};
export const DEMO_READING: ReadingSnapshot = {
  metadata: { "crawl-purpose": {
    version: 2, normalization: "PERCENTAGE", units: [{name:"share",value:"percent"}],
    dateRange: [{startTime: days[0] + "T00:00:00Z", endTime:"2026-09-08T00:00:00Z"}],
    fetchedAt: "2026-09-08T03:00:00Z", lastUpdated: "2026-09-08T02:00:00Z",
    coverage: {startTime:days[0]+"T00:00:00Z",endTime:"2026-09-08T00:00:00Z",expectedDays:28,observedDays:27,missingDays:[days[12]]},
  }},
  series: Object.fromEntries(["TRAINING","SEARCH","USER_ACTION"].map((purpose,j) => [
    "crawl-purpose:" + purpose, days.filter((_,i) => i !== 12).map((period,i) => ({
      period, value: j === 0 ? 55 - i/2 : j === 1 ? 30+i/5 : 15+i*0.3, lo:null, hi:null,
    })),
  ])),
};
