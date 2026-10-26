import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { MASTODON_ORIGINS, SOCIAL_LIMITS } from "@/lib/social-contract";
import { BLUESKY_STREAM_URL, INITIAL_SOCIAL_STATE, boundedSocialJson, runSocialJob, sampleBluesky, sampleMastodon, socialSampleWrite, type SocialState } from "./social";

vi.mock("./state", () => ({ readCollectorState: vi.fn(), commitCollectorState: vi.fn() }));
import { commitCollectorState, readCollectorState } from "./state";

const blue = (rkey: string, text = "ordinary post") => JSON.stringify({ $type: "message", payload: { $type: "network.bsky.jetstream.subscribeEvents#commit", seq: 123,
  did: "did:plc:fixture", rkey, time: "2026-09-11T03:00:01Z", operation: "create", collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text } } });
const post = (id = "123", text = "ordinary post", bot = false) => ({ id, content: `<p>${text}</p>`, account: { bot }, created_at: "2026-09-11T03:00:00Z", visibility: "public", reblog: null, in_reply_to_id: null });

class FakeSocket {
  static sockets: FakeSocket[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  binaryType = "";
  closed = false;
  constructor(public url: string, public protocol: string) { FakeSocket.sockets.push(this); }
  close() { this.closed = true; }
  emit(data: unknown) { this.onmessage?.({ data }); }
}
function socket() { return FakeSocket.sockets.at(-1)!; }
function fakeSocket() { FakeSocket.sockets = []; vi.stubGlobal("WebSocket", FakeSocket); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("bounded Bluesky sample", () => {
  it("uses current v2 filters and no cursor, deduplicates records and closes on deadline", async () => {
    vi.useFakeTimers(); fakeSocket();
    const promise = sampleBluesky();
    expect(socket().url).toBe(BLUESKY_STREAM_URL);
    expect(new URL(socket().url).searchParams.has("cursor")).toBe(false);
    expect(socket().protocol).toBe("xrpc.v1.json");
    socket().emit(blue("a", "This post was written by ChatGPT."));
    socket().emit(blue("a", "This post was written by ChatGPT."));
    socket().emit(blue("b"));
    await vi.advanceTimersByTimeAsync(SOCIAL_LIMITS.bluesky.durationMs);
    const result = await promise;
    expect(result.outcome).toBe("success");
    expect(result.sample).toMatchObject({ sampledPosts: 2, aiDisclosurePosts: 1, automatedAccountPosts: 0, coverage: { duplicateRecords: 1 } });
    expect(socket().closed).toBe(true);
    expect(JSON.stringify(result)).not.toContain("did:plc:fixture");
    expect(JSON.stringify(result)).not.toContain("ChatGPT");
  });
  it("counts non-post frames toward the hard event cap", async () => {
    fakeSocket();
    const promise = sampleBluesky();
    for (let i = 0; i < SOCIAL_LIMITS.bluesky.frames; i++) socket().emit("{}");
    expect(await promise).toMatchObject({ outcome: "failed", sample: null, reason: "frame-limit" });
    expect(socket().closed).toBe(true);
  });
  it("reports a partial observation on error after a usable post", async () => {
    fakeSocket();
    const promise = sampleBluesky();
    socket().emit(blue("a"));
    socket().emit(JSON.stringify({ $type: "error", error: "ConsumerTooSlow", message: "private upstream text" }));
    const result = await promise;
    expect(result).toMatchObject({ outcome: "partial", reason: "upstream-protocol-error", sample: { sampledPosts: 1 } });
    expect(JSON.stringify(result)).not.toContain("private upstream text");
  });
  it("stops oversized frames and never fabricates a zero for empty connections", async () => {
    vi.useFakeTimers(); fakeSocket();
    const oversized = sampleBluesky();
    socket().emit("x".repeat(SOCIAL_LIMITS.bluesky.frameBytes + 1));
    expect(await oversized).toMatchObject({ sample: null, outcome: "failed", reason: "byte-limit" });
    const empty = sampleBluesky();
    await vi.advanceTimersByTimeAsync(SOCIAL_LIMITS.bluesky.durationMs);
    expect(await empty).toMatchObject({ sample: null, outcome: "failed", reason: "no-usable-observations" });
  });
});

describe("bounded Mastodon sample", () => {
  it("fetches exactly one fixed local page per instance and stores only aggregates", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([post("123", "This post was written by AI.", true), post("123"), post("124")])));
    // Each fetch needs its own readable body.
    fetcher.mockImplementation(async () => new Response(JSON.stringify([post("123", "This post was written by AI.", true), post("123"), post("124")])));
    vi.stubGlobal("fetch", fetcher);
    const result = await sampleMastodon();
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) expect(fetcher.mock.calls[i]).toMatchObject([`${MASTODON_ORIGINS[i]}/api/v1/timelines/public?local=true&limit=40`, { redirect: "error", cache: "no-store" }]);
    expect(result.sample).toMatchObject({ sampledPosts: 4, aiDisclosurePosts: 2, automatedAccountPosts: 2, coverage: { duplicateRecords: 2 } });
    expect(JSON.stringify(result)).not.toContain("This post was");
    expect(JSON.stringify(result)).not.toContain('"account"');
  });
  it("does not retry restrictions and reports incomplete instance coverage", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 429 })).mockResolvedValueOnce(new Response(JSON.stringify([post()])));
    vi.stubGlobal("fetch", fetcher);
    const result = await sampleMastodon();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ outcome: "partial", sample: { sampledPosts: 1, coverage: { scopes: [
      { outcome: "failed", reason: "rate-limited" }, { outcome: "success" },
    ] } } });
  });
  it("treats empty or disabled timelines as unavailable, not observed zeros", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    expect(await sampleMastodon()).toMatchObject({ sample: null, outcome: "failed" });
  });
  it("aborts slow requests at the deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("abort")));
    })));
    const promise = sampleMastodon();
    await vi.advanceTimersByTimeAsync(SOCIAL_LIMITS.mastodon.durationMs);
    expect(await promise).toMatchObject({ sample: null, outcome: "failed" });
  });
  it("enforces response byte caps before parsing or buffering an entire body", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(30)); }, cancel }));
    await expect(boundedSocialJson(response, 20)).rejects.toThrow("byte-limit");
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("daily reservation and atomic sample commit", () => {
  const ctx = () => ({ db: {} as Db, deadline: Date.now() + 30000 });
  it("disables collection before touching the database or public network", async () => {
    vi.stubEnv("SOCIAL_COLLECTION_ENABLED", "0");
    const sample = vi.fn();
    expect(await runSocialJob(ctx(), "bluesky", sample)).toMatchObject({ outcome: "disabled" });
    expect(readCollectorState).not.toHaveBeenCalled();
    expect(commitCollectorState).not.toHaveBeenCalled();
    expect(sample).not.toHaveBeenCalled();
  });
  it("reserves before network work and allows only one concurrent daily attempt", async () => {
    let current = { state: { ...INITIAL_SOCIAL_STATE }, revision: 0 };
    vi.mocked(readCollectorState).mockImplementation(async () => ({ state: { ...current.state }, revision: current.revision }));
    vi.mocked(commitCollectorState).mockImplementation(async (_db, _key, prior, next) => {
      if (prior.revision !== current.revision) return false;
      current = { state: next as SocialState, revision: current.revision + 1 };
      return true;
    });
    const sample = vi.fn(async () => {
      expect(current.state.status).toBe("reserved");
      return { sample: null, outcome: "failed" as const, reason: "unavailable" };
    });
    await Promise.all([runSocialJob(ctx(), "bluesky", sample), runSocialJob(ctx(), "bluesky", sample)]);
    expect(sample).toHaveBeenCalledOnce();
    await runSocialJob(ctx(), "bluesky", sample);
    expect(sample).toHaveBeenCalledOnce();
    expect(current.state).toMatchObject({ status: "failed", outcome: "failed" });
  });
  it("does not collect after database reservation failure", async () => {
    vi.mocked(readCollectorState).mockResolvedValue({ state: INITIAL_SOCIAL_STATE, revision: 0 });
    vi.mocked(commitCollectorState).mockRejectedValue(new Error("database unavailable"));
    const sample = vi.fn();
    await expect(runSocialJob(ctx(), "bluesky", sample)).rejects.toThrow("database unavailable");
    expect(sample).not.toHaveBeenCalled();
  });
  it("guards aggregate writes and never replaces an already committed sample", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([post()]))));
    const result = await sampleMastodon();
    const query = new PgDialect().sqlToQuery(socialSampleWrite(result.sample!, sql`revision = ${4}`));
    expect(query.sql).toContain("where revision = $");
    expect(query.sql).toContain("on conflict (platform, day, collection_version) do nothing");
    expect(query.params).toContain(4);
    expect(JSON.stringify(query.params)).not.toContain("ordinary post");
  });
});
