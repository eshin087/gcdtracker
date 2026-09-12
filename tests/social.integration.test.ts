import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createNeonBridge } from "./support/neon-local";
import { commitCollectorState, readCollectorState } from "../src/lib/ingest/state";
import { INITIAL_SOCIAL_STATE, runSocialJob, socialSampleWrite, socialStateKey, type SocialObservation } from "../src/lib/ingest/social";
import { BLUESKY_ORIGIN, MASTODON_ORIGINS, type SocialPlatform, type SocialSample } from "../src/lib/social-contract";
import { publicSocialSample } from "../src/lib/social-report";

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
const actualFetch = globalThis.fetch;
beforeAll(async () => { bridge = await createNeonBridge(); });
afterAll(async () => { await bridge?.close(); });
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await bridge.query("truncate social_samples");
  await bridge.query("delete from collector_state where key in ($1,$2)", [socialStateKey("bluesky"), socialStateKey("mastodon")]);
  vi.stubGlobal("fetch", ((input, init) => {
    if (String(input) === bridge.endpoint) return actualFetch(input, init);
    throw new Error("Unexpected outbound request in social database test");
  }) satisfies typeof fetch);
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("Unexpected outbound socket in social database test"); } });
});

function fixture(platform: SocialPlatform = "bluesky"): SocialSample {
  const startedAt = new Date().toISOString();
  const bluesky = platform === "bluesky";
  const scopes = bluesky ? [BLUESKY_ORIGIN + "/app.bsky.feed.post"] : [...MASTODON_ORIGINS];
  return {
    platform, day: startedAt.slice(0, 10), collectionVersion: 1, startedAt, finishedAt: startedAt,
    sampledPosts: 10, aiDisclosurePosts: 2, automatedAccountPosts: bluesky ? 0 : 3, scopes, outcome: "success",
    coverage: {
      method: bluesky ? "jetstream-v2-live-create-sample" : "local-public-timeline-snapshot",
      representative: false, disclosureLanguage: "en", disclosureDefinition: "explicit-first-person-content-disclosure-v1",
      attribution: "unverified-text-signals", automatedAccountMeaning: bluesky ? "not-observed" : "self-designated-bot-not-necessarily-ai",
      includesReplies: false, includesBoosts: false, publisherFrom: startedAt, publisherTo: startedAt,
      requestedDurationMs: bluesky ? 8000 : 6000, maxRequests: bluesky ? 1 : 2,
      maxRecords: bluesky ? 300 : 80, maxBytes: bluesky ? 262144 : 524288, maxFrameBytes: bluesky ? 65536 : null,
      receivedRecords: 10, receivedBytes: 1000, excludedRecords: 0, invalidRecords: 0, duplicateRecords: 0, reasons: ["qa-fixture"],
      scopes: scopes.map(scope => ({ scope, outcome: "success", reason: null, sampledPosts: bluesky ? 10 : 5 })),
    },
  };
}
function observation(sample: SocialSample): SocialObservation { return { sample, outcome: sample.outcome, reason: "qa-fixture" }; }
function context() { return { db: bridge.db, deadline: Date.now() + 30_000 }; }
async function state(platform: SocialPlatform) { return readCollectorState(bridge.db, socialStateKey(platform), INITIAL_SOCIAL_STATE); }

describe("social samples through Neon HTTP transactions against isolated PostgreSQL", () => {
  it("permits only one daily sample under concurrent calls and commits its summary with completion", async () => {
    const sampler = vi.fn(async () => observation(fixture()));
    const reports = await Promise.all(Array.from({ length: 12 }, () => runSocialJob(context(), "bluesky", sampler)));
    expect(sampler).toHaveBeenCalledTimes(1);
    expect(reports.some(report => report.outcome === "success")).toBe(true);
    expect((await bridge.query("select sampled_posts, ai_disclosure_posts, automated_account_posts from social_samples")).rows)
      .toEqual([{ sampled_posts: 10, ai_disclosure_posts: 2, automated_account_posts: 0 }]);
    expect(await state("bluesky")).toMatchObject({ revision: 2, state: { status: "completed", outcome: "success" } });
    const replay = await runSocialJob(context(), "bluesky", sampler);
    expect(replay.stats.alreadyAttempted).toBe(true);
    expect(sampler).toHaveBeenCalledTimes(1);
    expect((await bridge.query("select count(*)::int as n from social_samples")).rows[0].n).toBe(1);
  });

  it("allows each platform one independent sample and retains explicit observed zero signals", async () => {
    const blue = fixture();
    blue.aiDisclosurePosts = 0;
    await Promise.all([
      runSocialJob(context(), "bluesky", async () => observation(blue)),
      runSocialJob(context(), "mastodon", async () => observation(fixture("mastodon"))),
    ]);
    expect((await bridge.query("select platform,sampled_posts,ai_disclosure_posts from social_samples order by platform")).rows)
      .toEqual([{ platform: "bluesky", sampled_posts: 10, ai_disclosure_posts: 0 }, { platform: "mastodon", sampled_posts: 10, ai_disclosure_posts: 2 }]);
    expect((await state("mastodon")).state.outcome).toBe("success");
  });

  it("records failed access as missing data and does not retry it into a false zero sample", async () => {
    const sampler = vi.fn(async (): Promise<SocialObservation> => ({ sample: null, outcome: "failed", reason: "access-restricted" }));
    const first = await runSocialJob(context(), "mastodon", sampler);
    const retry = await runSocialJob(context(), "mastodon", sampler);
    expect(first).toMatchObject({ outcome: "failed", stats: { missing: true, reason: "access-restricted" } });
    expect(retry).toMatchObject({ outcome: "failed", stats: { alreadyAttempted: true } });
    expect(sampler).toHaveBeenCalledTimes(1);
    expect((await bridge.query("select count(*)::int as n from social_samples")).rows[0].n).toBe(0);
    expect(await state("mastodon")).toMatchObject({ revision: 2, state: { status: "failed", outcome: "failed" } });
  });

  it("keeps the daily reservation when summary validation fails without marking completion", async () => {
    const invalid = fixture();
    invalid.aiDisclosurePosts = invalid.sampledPosts + 1;
    await expect(runSocialJob(context(), "bluesky", async () => observation(invalid))).rejects.toThrow();
    expect((await state("bluesky"))).toMatchObject({ revision: 1, state: { status: "reserved", outcome: null } });
    expect((await bridge.query("select count(*)::int as n from social_samples")).rows[0].n).toBe(0);
    const sampler = vi.fn(async () => observation(fixture()));
    expect(await runSocialJob(context(), "bluesky", sampler)).toMatchObject({ outcome: "partial", stats: { alreadyAttempted: true } });
    expect(sampler).not.toHaveBeenCalled();
  });

  it("rolls back an inserted aggregate and completion checkpoint together on a later transaction error", async () => {
    const snapshot = await state("bluesky");
    const sample = fixture();
    const reserved = { ...INITIAL_SOCIAL_STATE, day: sample.day, status: "reserved" as const, startedAt: sample.startedAt };
    expect(await commitCollectorState(bridge.db, socialStateKey("bluesky"), snapshot, reserved)).toBe(true);
    const pending = await state("bluesky");
    const completed = { ...reserved, status: "completed" as const, finishedAt: sample.finishedAt, outcome: "success" as const };
    await expect(commitCollectorState(bridge.db, socialStateKey("bluesky"), pending, completed,
      guard => [socialSampleWrite(sample, guard), sql`select 1 / 0`])).rejects.toThrow();
    expect((await bridge.query("select count(*)::int as n from social_samples")).rows[0].n).toBe(0);
    expect(await state("bluesky")).toEqual(pending);
    expect(await commitCollectorState(bridge.db, socialStateKey("bluesky"), pending, completed,
      guard => [socialSampleWrite(sample, guard)])).toBe(true);
    expect(await state("bluesky")).toMatchObject({ revision: 2, state: { status: "completed" } });
    expect((await bridge.query("select count(*)::int as n from social_samples")).rows[0].n).toBe(1);
  });

  it.each(["bluesky", "mastodon"] as const)("projects real %s collector-shaped rows without exposing future raw fields", async platform => {
    await runSocialJob(context(), platform, async () => observation(fixture(platform)));
    const stored = (await bridge.query(`select platform, day::text, collection_version as "collectionVersion",
      started_at as "startedAt", finished_at as "finishedAt", sampled_posts as "sampledPosts",
      ai_disclosure_posts as "aiDisclosurePosts", automated_account_posts as "automatedAccountPosts", scopes, outcome, coverage
      from social_samples where platform = $1`, [platform])).rows[0];
    const projected = publicSocialSample({ ...stored, rawPost: "qa-private-marker", cursor: "qa-private-marker",
      coverage: { ...stored.coverage, rawBody: "qa-private-marker", scopes: stored.coverage.scopes.map((scope: object) => ({ ...scope, rawAccount: "qa-private-marker" })) } });
    expect(projected).not.toBeNull();
    expect(projected).toMatchObject({ platform, sampledPosts: 10, aiDisclosurePosts: 2 });
    expect(JSON.stringify(projected)).not.toContain("qa-private-marker");
  });
});
