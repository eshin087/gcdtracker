import type { FlowData, FlowSource } from "./flow";
import { fmtBytes, fmtInt, fmtStamp } from "./format";
import type { ReadingSnapshot } from "./reading-report";
import { SOCIAL_PLATFORMS, SOCIAL_SOURCE_DOCS } from "./social-contract";
import type { PublicSocialSample, SocialReportData } from "./social-report";

const DAY = 86_400_000;
const PURPOSE_PREFIX = "crawl-purpose:";
const SOCIAL_LABELS = { bluesky: "Bluesky", mastodon: "Mastodon" };
const SOCIAL_SCALE = "Paths partition the latest individual sample for each platform. Width and dot density compare posts within that sample only; platform samples have different scopes and times. No disclosure match means unclassified, not human-authored. Bot flags may overlap disclosure matches and are shown only in the inspector. Animation illustrates aggregate observations, not live posts.";

function socialDetails(sample: PublicSocialSample): NonNullable<FlowSource["details"]> {
  const { coverage } = sample;
  return [
    { label: "Sample window", value: `${sample.startedAt} → ${sample.finishedAt}` },
    { label: "Sample status", value: `${sample.outcome} · ${fmtInt(sample.sampledPosts)} sampled original posts` },
    { label: "Disclosure evidence", value: "English text matches; unverified. No model attribution or platform-wide prevalence is inferred." },
    { label: "Account bot flags", value: sample.automatedAccountPosts === null ? "Not observed on Bluesky; not zero." : `${fmtInt(sample.automatedAccountPosts)} sampled posts from self-designated bot accounts; not necessarily AI. May overlap disclosure matches.` },
    { label: "Collection caps", value: `${coverage.maxRequests} request(s), ${fmtInt(coverage.maxRecords)} records/frames, ${fmtBytes(coverage.maxBytes)} decoded processing, ${coverage.requestedDurationMs / 1000}s. Not continuous collection.` },
    { label: "Source scopes", value: coverage.scopes.map(scope => `${scope.scope}: ${scope.outcome}, ${fmtInt(scope.sampledPosts)} sampled posts`).join("; ") || "Unavailable" },
    { label: "Publisher timestamp span", value: coverage.publisherFrom && coverage.publisherTo ? `${fmtStamp(coverage.publisherFrom)} – ${fmtStamp(coverage.publisherTo)}; distinct from the sampling window.` : "Unavailable; no authorship date inferred." },
    { label: "Methodology", value: `Collection v${sample.collectionVersion}; ${coverage.disclosureDefinition}. Replies and boosts excluded. Daily timeline snapshots can overlap; they are not added together.` },
  ];
}

/** Social snapshots may overlap across days: show one observation per platform, never their sum. */
export function socialFlow(report: SocialReportData): FlowData {
  const latest = SOCIAL_PLATFORMS.flatMap(platform => {
    const sample = report.samples.filter(row => row.platform === platform).sort((a, b) =>
      b.day.localeCompare(a.day) || b.startedAt.localeCompare(a.startedAt) || b.finishedAt.localeCompare(a.finishedAt))[0];
    return sample ? [sample] : [];
  });
  const sources = latest.flatMap(sample => {
    const platform = SOCIAL_LABELS[sample.platform];
    const base = {
      feed: sample.platform, unit: "posts" as const, observedDays: 1, latestObservation: sample.finishedAt,
      purpose: `Observed original public posts in the ${platform} sample`,
      href: SOCIAL_SOURCE_DOCS[sample.platform],
      comparisonGroup: `${sample.platform}:${sample.day}:${sample.startedAt}`,
      coverageLabel: `One ${sample.outcome} sample · ${sample.day} · ${fmtInt(sample.sampledPosts)} original posts`,
      details: socialDetails(sample),
      method: sample.platform === "bluesky" ? "Bounded live-tip Jetstream create-event sample. Relay replay can expose older content; this is not a current post inventory." : "Bounded local public timeline snapshots from selected servers. Server selection and overlapping snapshots prevent platform-wide inference.",
    };
    return [
      { ...base, id: `${sample.platform}:disclosure`, label: `${platform} · disclosure matches`, total: sample.aiDisclosurePosts,
        evidence: "Narrow, unverified English AI-disclosure text matches; not verified AI authorship." },
      { ...base, id: `${sample.platform}:unclassified`, label: `${platform} · unclassified`, total: sample.sampledPosts - sample.aiDisclosurePosts,
        evidence: "No matching disclosure text in the sample. AI use remains unknown; this is not a human-authored count." },
    ];
  });
  const starts = latest.map(sample => sample.startedAt).sort();
  const ends = latest.map(sample => sample.finishedAt).sort();
  return {
    sources, targets: SOCIAL_PLATFORMS.map(id => ({ id, label: SOCIAL_LABELS[id] })),
    links: sources.map(source => ({ source: source.id, target: source.feed, value: source.total })),
    feeds: latest.map(sample => ({ key: sample.platform, label: SOCIAL_LABELS[sample.platform], outcome: sample.outcome, lastRun: sample.finishedAt, stale: false, outcomeLabel: "Recorded sample outcome", lastRunLabel: "Sample finished" })),
    mode: report.mode === "demo" ? "demo" : report.mode === "offline" || report.mode === "unavailable" && !latest.length ? "offline" : "observed",
    days: 1, windowStart: starts[0] ?? "", windowEnd: ends.at(-1) ?? "",
    windowLabel: latest.length ? "Latest individual sample per platform · inspect each sample's UTC time and coverage" : "No usable social samples available",
    sourceHeading: "PUBLISHING EVIDENCE", targetHeading: "SAMPLED PLATFORMS", scaleNote: SOCIAL_SCALE,
    emptyMessage: "No social samples available. Missing observations do not mean zero posting activity.",
  };
}

function purposeLabel(key: string): string {
  const purpose = key.slice(PURPOSE_PREFIX.length);
  return ({ TRAINING: "Training", SEARCH: "Search indexing", USER_ACTION: "User-triggered retrieval" } as Record<string, string>)[purpose]
    ?? purpose.replaceAll("_", " ").toLowerCase();
}

/** One complete common date from one normalized snapshot; never add percentages across dates. */
export function readingFlow(snapshot: ReadingSnapshot, mode: FlowData["mode"] = "observed"): FlowData {
  const meta = snapshot.metadata["crawl-purpose"];
  const empty: FlowData = {
    sources: [], targets: [{ id: "cloudflare-web", label: "Cloudflare-observed web" }], links: [], feeds: [], mode,
    days: 1, windowStart: "", windowEnd: "", sourceHeading: "CRAWLER PURPOSE", targetHeading: "OBSERVATION SCOPE",
    windowLabel: "No complete crawler-purpose observation available",
    emptyMessage: "No complete crawler-purpose observation available. Missing data does not mean zero traffic.",
    scaleNote: "Widths compare purpose shares on one common UTC date within one Cloudflare Radar snapshot. Percentages are not request counts and are never added across dates. Cloudflare-observed web is a network scope, not a named social platform. Animation illustrates aggregate observations, not live requests.",
  };
  if (!meta || meta.version !== 2 || meta.normalization !== "PERCENTAGE" || meta.dateRange.length !== 1) return empty;
  const start = Date.parse(meta.dateRange[0].startTime), end = Date.parse(meta.dateRange[0].endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start % DAY || end % DAY || end - start > 32 * DAY) return empty;
  const keys = [...new Set([
    ...Object.keys(snapshot.series).filter(key => key.startsWith(PURPOSE_PREFIX)),
    ...(meta.unavailable ?? []).map(item => item.series).filter(key => key.startsWith(PURPOSE_PREFIX)),
  ])];
  if (!keys.length) return empty;
  const points = keys.map(key => new Map((snapshot.series[key] ?? []).map(point => [point.period, point.value])));
  const missing = new Set(meta.coverage?.missingDays ?? []);
  const complete: string[] = [];
  for (let time = start; time < end; time += DAY) {
    const day = new Date(time).toISOString().slice(0, 10);
    if (missing.has(day) || meta.unavailable?.some(item => item.series.startsWith(PURPOSE_PREFIX) && (!item.period || item.period === day))) continue;
    if (points.every(series => {
      const value = series.get(day);
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
    })) complete.push(day);
  }
  const day = complete.at(-1);
  if (!day) return empty;
  const windowEnd = new Date(Date.parse(day + "T00:00:00Z") + DAY).toISOString().slice(0, 10);
  const observedWindow = `${meta.dateRange[0].startTime} → ${meta.dateRange[0].endTime} (exclusive)`;
  const sources: FlowSource[] = keys.map((key, index) => ({
    id: key, label: purposeLabel(key), total: points[index].get(day)!, feed: "radar", unit: "% share",
    purpose: "Share of Cloudflare-observed AI crawler traffic by source-assigned purpose",
    evidence: "Cloudflare Radar purpose classification; no specific model or social-platform destination is inferred.",
    method: "Latest common complete date in one PERCENTAGE-normalized snapshot. Retains the publisher's units and window; percentages describe purpose mix, not growth in requests.",
    href: "https://radar.cloudflare.com/ai-insights", observedDays: 1, latestObservation: day + "T00:00:00Z",
    comparisonGroup: `radar:crawl-purpose:${meta.fetchedAt}:${day}`,
    coverageLabel: `${day} UTC · all ${keys.length} returned purpose categories observed`,
    details: [
      { label: "Snapshot window", value: observedWindow },
      { label: "Selected observation", value: `${day} UTC; latest complete common date. ${complete.length} complete dates in the returned window.` },
      { label: "Normalization / units", value: `${meta.normalization}; ${meta.units.map(unit => `${unit.name}: ${unit.value}`).join("; ")}` },
      { label: "Source coverage", value: meta.coverage ? `${meta.coverage.observedDays}/${meta.coverage.expectedDays} complete dates; ${meta.coverage.missingDays.length} missing or incomplete. ${meta.coverage.startTime} → ${meta.coverage.endTime} (exclusive).` : "Overall collection coverage unavailable; common dates checked from returned values." },
      { label: "Snapshot fetched", value: meta.fetchedAt },
      { label: "Publisher updated", value: meta.lastUpdated ?? "Unavailable" },
      { label: "Publisher confidence", value: meta.confidenceInfo ? `Level ${meta.confidenceInfo.level}. ${meta.confidenceInfo.annotations.map(item => `${item.dataSource}: ${item.description} (${item.startDate} → ${item.endDate})`).join("; ")}` : "Not supplied; no confidence inferred." },
    ],
  }));
  return { ...empty, sources, links: sources.map(source => ({ source: source.id, target: "cloudflare-web", value: source.total })),
    feeds: [{ key: "radar", label: "Cloudflare Radar", outcome: "unknown", lastRun: null, stale: false }],
    windowStart: day, windowEnd, windowLabel: `${day} UTC · latest complete common date · Cloudflare Radar purpose share`,
  };
}


