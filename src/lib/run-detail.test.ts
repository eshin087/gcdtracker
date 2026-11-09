import { describe, expect, it } from "vitest";
import { sourceHealth } from "./health";
import { failureCode, runDetail } from "./run-detail";

describe("failure vocabulary", () => {
  it.each([
    ["HTTP 403", "HTTP 403"],
    ["github search 422 Validation Failed", "HTTP 422"],
    ["moltbook 503: invalid or failed response", "HTTP 503"],
    ["Radar bot API HTTP 429", "HTTP 429"],
    ["Radar metadata rejected: window or normalization", "metadata rejected, window or normalization"],
    ["Radar invalid point", "response failed validation"],
    ["watched search exceeds 100 PRs in one timestamp; progress retained", "response failed validation"],
    ["The operation was aborted due to timeout", "timed out"],
    ["github rate limited", "rate limited"],
    ["social sample commit was superseded", "concurrent run"],
    ["fetch failed", "network error"],
    ["something nobody anticipated", "unexpected error"],
    [undefined, "unexpected error"],
  ])("reduces %j to %j", (message, code) => expect(failureCode(message)).toBe(code));

  it("never repeats text from a message it does not recognize", () => {
    const secrets = [
      "getaddrinfo ENOTFOUND private-host-123456.db.example",
      'password authentication failed for user "fixture_owner"',
      "connect ECONNREFUSED 10.1.2.3:5432",
      "Bearer fixture-token-0123456789abcdef rejected",
      "postgresql://fixture_owner:fixture-password@private-host.db.example/db",
    ];
    for (const secret of secrets) {
      const detail = runDetail({ stats: { failed: [secret, "radar: " + secret, "hfDaily"], hfDaily: secret, reason: secret, stopped: secret, skipped: secret, sampleFeed: secret }, error: "Error: " + secret });
      expect(detail).not.toMatch(/db\.example|private-host|fixture|10\.1\.2\.3|5432|postgresql/);
      expect(detail).toMatch(/^error: /);
    }
  });
});

describe("public run detail", () => {
  it("explains each failed Radar group without the upstream message", () => {
    expect(runDetail({ stats: { rows: 0, failed: ["bot-share: Radar metadata rejected: window or normalization", "crawl-purpose: HTTP 403"], attemptedToday: [], unavailable: [] } }))
      .toBe("failed: bot-share (metadata rejected, window or normalization), crawl-purpose (HTTP 403)");
  });
  it("reads a sub-step's message from its own key and names repositories", () => {
    expect(runDetail({ stats: { failed: ["registry", "hfDaily"], registry: "Radar bot API HTTP 403", hfDaily: "hfDaily 503: invalid row count" } })).toBe("failed: registry (HTTP 403), hfDaily (HTTP 503)");
    expect(runDetail({ stats: { failed: ["fern-api/docs: watched search page is incomplete; progress retained"] } })).toBe("failed: fern-api/docs (response failed validation)");
    expect(runDetail({ stats: { failed: ["a: x", "b: x", "c: x", "d: x", "e: x", "f: x"] } })).toMatch(/and 2 more$/);
  });
  it("does not publish a host, path, URL or prototype key as a name", () => {
    expect(runDetail({ stats: { failed: ["private-host.db.example", "/var/task/secret", "__proto__", "private-host.db.example: refused"] } }))
      .toBe("failed: unexpected error, unexpected error, unexpected error, unexpected error");
    expect(runDetail({ stats: { failed: ["private-host.db.example/db: refused", "@scope/package: HTTP 404"], attemptedToday: ["private-host.db.example"], unavailable: ["a/b"] } }))
      .toBe("failed: unexpected error, HTTP 404");
  });
  it("describes rate limits, bounds and progress with fixed phrases", () => {
    expect(runDetail({ stats: { queries: 23, yesterday: "23/23", sampleFeed: "rate limited", stopped: "rate limited", rateLimitedUntil: "2026-11-08T03:03:41.000Z", rateLimitBasis: "retry-after" } }))
      .toBe("stopped: rate limited; rate limited until 03:03 UTC (retry-after); sample feed rate limited");
    expect(runDetail({ stats: { yesterday: "10/23", stopped: "deadline", sampleFeed: "deadline" } })).toBe("stopped: deadline; previous day 10/23; sample feed deadline");
    expect(runDetail({ stats: { pages: 60, reached: false, cappedDays: ["2026-11-06", "2026-11-07"] } })).toBe("feed walk stopped at its page cap; lower-bound days: 2026-11-06, 2026-11-07");
    expect(runDetail({ stats: { outcome: "partial", reason: "stream-closed-early", sampledPosts: 156 } })).toBe("stream-closed-early");
    expect(runDetail({ stats: { outcome: "success", reason: "byte-limit", sampledPosts: 156 } })).toBeNull();
    expect(runDetail({ stats: { registryScan: "in progress", registryChecked: 240 } })).toBe("registry scan in progress, 240 checked");
    expect(runDetail({ stats: { finals: "6/6", provisional: "2/6", pendingFinals: 18, catchUp: "2026-11-03 5/23" } })).toBe("provisional counts 2/6; catch-up 2026-11-03 5/23; 18 older counts pending");
    expect(runDetail({ stats: { skipped: "GITHUB_TOKEN not set" } })).toBe("disabled: GITHUB_TOKEN not set");
    expect(runDetail({ stats: { notRun: "deadline" } })).toBe("not run: deadline");
    expect(runDetail({ stats: { metadataDropped: ["operator: annotation, lastUpdated", "bad group: annotation", "bot-share: private-host.db.example"] } })).toBe("publisher metadata left out: operator (annotation, lastUpdated)");
  });
  it("says nothing for an ordinary successful run and ignores unexpected shapes", () => {
    expect(runDetail({ stats: { rows: 12, queries: 24, outcome: "success", partial: false, yesterday: "23/23", finals: "6/6", provisional: "6/6", registryScan: "complete", registryChecked: 400, reached: true, cappedDays: [], failed: [], metadataDropped: [] } })).toBeNull();
    expect(runDetail({ stats: null })).toBeNull();
    expect(runDetail({ stats: { failed: "not a list", reason: 7, rateLimitedUntil: "never", cappedDays: ["../../etc"], yesterday: "all", registryScan: "IN PROGRESS at host.example" } })).toBeNull();
  });
  it("is bounded in length", () => {
    const failed = Array.from({ length: 4 }, (_, i) => `${"r".repeat(70)}${i}: HTTP 500`);
    expect(runDetail({ stats: { failed, metadataDropped: ["operator: annotation"], reason: "x".repeat(50) } })!.length).toBeLessThanOrEqual(280);
  });
  it("is attached to source health from the stored run", () => {
    const health = sourceHealth({ source: "radar", finishedAt: "2026-11-08T03:01:05Z", ok: false, stats: { outcome: "failed", failed: ["crawl-purpose: HTTP 403"] }, error: null }, Date.parse("2026-11-08T04:00:00Z"));
    expect(health).toMatchObject({ outcome: "failed", detail: "failed: crawl-purpose (HTTP 403)" });
    expect(sourceHealth({ source: "mcp", finishedAt: "2026-11-08T03:01:05Z", ok: true, stats: { outcome: "success" } }, Date.parse("2026-11-08T04:00:00Z")).detail).toBeNull();
    expect(sourceHealth({ source: "moltbook", finishedAt: "2026-11-08T03:01:05Z", ok: false, stats: {}, error: "Error: moltbook 502: invalid or failed response" }, Date.parse("2026-11-08T04:00:00Z")).detail).toBe("error: HTTP 502");
  });
});
