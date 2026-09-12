import { describe, expect, it } from "vitest";
import { DEMO_READING, DEMO_SOCIAL } from "./demo-social";
import { destinationCounts, flowWeight, formatFlowValue } from "./flow";
import { readingFlow, socialFlow } from "./flow-observatory";
import type { ReadingSnapshot } from "./reading-report";
import type { PublicSocialSample, SocialReportData } from "./social-report";

function socialSample(platform: PublicSocialSample["platform"], day = "2026-09-07"): PublicSocialSample {
  const original = DEMO_SOCIAL.samples.find(sample => sample.platform === platform && sample.day === day)!;
  return structuredClone(original);
}
function report(samples: PublicSocialSample[], mode: SocialReportData["mode"] = "observed"): SocialReportData {
  return { mode, days: ["2026-09-06", "2026-09-07"], samples };
}
function reading(): ReadingSnapshot { return structuredClone(DEMO_READING); }

describe("social publishing flow", () => {
  it("uses the latest individual sample for each platform without adding historical snapshots", () => {
    const result = socialFlow(DEMO_SOCIAL);
    expect(result.sources).toHaveLength(4);
    expect(destinationCounts("bluesky", result)).toBe("228 posts");
    expect(destinationCounts("mastodon", result)).toBe("57 posts");
    expect(result.sources.find(source => source.id === "bluesky:disclosure")?.total).toBe(6);
    expect(result.sources.find(source => source.id === "mastodon:unclassified")?.total).toBe(51);
    expect(result.sources.every(source => source.latestObservation === "2026-09-07T03:00:08.000Z")).toBe(true);
    expect(result.mode).toBe("demo");
  });

  it("keeps platform observation dates separate and never mutates input order", () => {
    const blue = socialSample("bluesky");
    const masto = socialSample("mastodon", "2026-09-06");
    const olderBlue = socialSample("bluesky", "2026-09-06");
    const input = report([masto, olderBlue, blue]);
    const before = structuredClone(input);
    const result = socialFlow(input);
    expect(result.sources.find(source => source.feed === "bluesky")?.coverageLabel).toContain("2026-09-07");
    expect(result.sources.find(source => source.feed === "mastodon")?.coverageLabel).toContain("2026-09-06");
    expect(result.windowStart).toBe(masto.startedAt);
    expect(result.windowEnd).toBe(blue.finishedAt);
    expect(input).toEqual(before);
  });

  it("uses timestamps to select deterministically among same-day samples", () => {
    const older = socialSample("mastodon");
    const newer = { ...older, startedAt: "2026-09-07T04:00:00.000Z", finishedAt: "2026-09-07T04:00:08.000Z", sampledPosts: 7, aiDisclosurePosts: 2, automatedAccountPosts: 1 };
    expect(destinationCounts("mastodon", socialFlow(report([newer, older])))).toBe("7 posts");
  });

  it("distinguishes an observed zero from an unavailable platform", () => {
    const blue = { ...socialSample("bluesky"), sampledPosts: 0, aiDisclosurePosts: 0 };
    const result = socialFlow(report([blue]));
    expect(destinationCounts("bluesky", result)).toBe("0 posts");
    expect(destinationCounts("mastodon", result)).toBe("No observations");
    expect(result.links).toHaveLength(2);
    expect(result.sources.every(source => source.total === 0)).toBe(true);
    expect(result.sources[0].details?.find(detail => detail.label === "Account bot flags")?.value).toContain("Not observed");
  });

  it("does not double count overlapping bot flags or call the remainder human", () => {
    const sample = { ...socialSample("mastodon"), sampledPosts: 10, aiDisclosurePosts: 6, automatedAccountPosts: 8 };
    const result = socialFlow(report([sample]));
    expect(result.links.map(link => link.value)).toEqual([6, 4]);
    expect(result.links.reduce((sum, link) => sum + link.value, 0)).toBe(10);
    expect(result.sources.map(source => source.label)).toEqual(["Mastodon · disclosure matches", "Mastodon · unclassified"]);
    expect(result.sources[1].evidence).toContain("AI use remains unknown");
    expect(result.sources[0].details?.find(detail => detail.label === "Account bot flags")?.value).toContain("8 sampled posts");
    expect(result.sources[0].details?.find(detail => detail.label === "Account bot flags")?.value).toContain("May overlap");
  });

  it("keeps partial state, English evidence, caps and actual scope outcomes inspectable", () => {
    const sample = socialSample("mastodon");
    sample.outcome = "partial";
    sample.coverage.scopes[1].outcome = "failed";
    const result = socialFlow(report([sample]));
    expect(result.feeds[0].outcome).toBe("partial");
    expect(result.feeds[0].outcomeLabel).toBe("Recorded sample outcome");
    expect(result.feeds[0].lastRunLabel).toBe("Sample finished");
    expect(result.sources[0].coverageLabel).toContain("partial");
    const details = result.sources[0].details!;
    expect(details.find(detail => detail.label === "Disclosure evidence")?.value).toContain("English");
    expect(details.find(detail => detail.label === "Disclosure evidence")?.value).toContain("unverified");
    expect(details.find(detail => detail.label === "Collection caps")?.value).toContain("80 records/frames");
    expect(details.find(detail => detail.label === "Source scopes")?.value).toContain("failed");
  });

  it.each(["offline", "unavailable"] as const)("keeps %s empty instead of substituting demo values", mode => {
    const result = socialFlow(report([], mode));
    expect(result.mode).toBe("offline");
    expect(result.sources).toEqual([]);
    expect(result.targets).toHaveLength(2);
    expect(result.windowStart).toBe("");
    expect(result.emptyMessage).toContain("Missing observations");
  });

  it("compares only the same individual platform sample", () => {
    const result = socialFlow(DEMO_SOCIAL);
    const source = result.sources[0];
    const biggerUnrelated = { ...source, id: "other", comparisonGroup: "different-sample", total: 1e9 };
    expect(flowWeight(source, [...result.sources, biggerUnrelated])).toBe(flowWeight(source, result.sources));
  });
});

describe("web crawling flow", () => {
  it("uses one complete date and preserves shares and public metadata", () => {
    const result = readingFlow(DEMO_READING, "demo");
    expect(result.sources.map(source => source.total)).toEqual([42, 35.2, 22.8]);
    expect(result.windowStart).toBe("2026-09-07");
    expect(result.windowEnd).toBe("2026-09-08");
    expect(result.mode).toBe("demo");
    expect(result.targets).toEqual([{ id: "cloudflare-web", label: "Cloudflare-observed web" }]);
    expect(result.sources.every(source => source.unit === "% share")).toBe(true);
    expect(destinationCounts("cloudflare-web", result)).toBe("100% share");
    expect(result.sources[0].details?.find(detail => detail.label === "Normalization / units")?.value).toBe("PERCENTAGE; share: percent");
    expect(result.sources[0].details?.find(detail => detail.label === "Snapshot fetched")?.value).toBe(DEMO_READING.metadata["crawl-purpose"].fetchedAt);
    expect(result.feeds[0].outcome).toBe("unknown");
  });

  it("falls back to the latest date common to every category", () => {
    const snapshot = reading();
    snapshot.series["crawl-purpose:SEARCH"].pop();
    const result = readingFlow(snapshot);
    expect(result.windowStart).toBe("2026-09-06");
    expect(result.sources.map(source => source.total)).toEqual([42.5, 35, 22.5]);
  });

  it("excludes explicit missing or incomplete dates even if stray values exist", () => {
    const snapshot = reading();
    snapshot.metadata["crawl-purpose"].coverage!.missingDays.push("2026-09-07");
    snapshot.metadata["crawl-purpose"].unavailable = [{ series: "crawl-purpose:TRAINING", period: "2026-09-06", reason: "missing" }];
    expect(readingFlow(snapshot).windowStart).toBe("2026-09-05");
  });

  it.each([NaN, Infinity, -1, 101])("excludes dates containing invalid share %s", value => {
    const snapshot = reading();
    snapshot.series["crawl-purpose:TRAINING"].at(-1)!.value = value;
    expect(readingFlow(snapshot).windowStart).toBe("2026-09-06");
  });

  it("does not drop a wholly unavailable category and present the others as complete", () => {
    const snapshot = reading();
    snapshot.metadata["crawl-purpose"].unavailable = [{ series: "crawl-purpose:OTHER", reason: "missing", period: "2026-09-07" }];
    const result = readingFlow(snapshot);
    expect(result.sources).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("keeps observed zero shares while refusing empty date intersections", () => {
    const snapshot = reading();
    for (const series of Object.values(snapshot.series)) series.at(-1)!.value = 0;
    expect(readingFlow(snapshot).sources.map(source => source.total)).toEqual([0, 0, 0]);
    snapshot.series["crawl-purpose:SEARCH"] = [];
    expect(readingFlow(snapshot).sources).toEqual([]);
  });

  it("excludes end-boundary points and unrelated legacy series", () => {
    const snapshot = reading();
    for (const series of Object.values(snapshot.series)) series.push({ period: "2026-09-08", value: 99, lo: null, hi: null });
    snapshot.series["operator:some-bot"] = [{ period: "2026-09-09", value: 1e6, lo: null, hi: null }];
    const result = readingFlow(snapshot);
    expect(result.windowStart).toBe("2026-09-07");
    expect(result.sources).toHaveLength(3);
  });

  it("withholds missing metadata and incompatible normalization without demo substitution", () => {
    const snapshot = reading();
    snapshot.metadata["crawl-purpose"].normalization = "MIN0_MAX";
    expect(readingFlow(snapshot).sources).toEqual([]);
    const offline = readingFlow({ series: {}, metadata: {} }, "offline");
    expect(offline.mode).toBe("offline");
    expect(offline.sources).toEqual([]);
  });

  it("retains non-integer percentages without multiplying them by 100", () => {
    expect(formatFlowValue(35.2, "% share")).toBe("35.2% share");
    expect(formatFlowValue(0.12, "% share")).toBe("0.12% share");
    expect(formatFlowValue(1234, "posts")).toBe("1,234 posts");
    expect(formatFlowValue(0, "% share")).toBe("0% share");
    expect(formatFlowValue(0.001, "% share")).toBe("<0.01% share");
    expect(formatFlowValue(1e-20, "% share")).toBe("<0.01% share");
    expect(formatFlowValue(0.1 + 0.2, "% share")).toBe("0.3% share");
  });
});

