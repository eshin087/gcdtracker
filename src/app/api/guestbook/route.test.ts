import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  execute: vi.fn((query: unknown) => query),
  batch: vi.fn(),
  getGuestbook: vi.fn(async () => []),
}));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute, batch: mocks.batch } }));
vi.mock("@/lib/stats", () => ({ getGuestbook: mocks.getGuestbook }));
import { GET, POST } from "./route";

function request(body: string = JSON.stringify({ name: "Agent", note: "Hello" }), headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/guestbook", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "ChatGPT-User/1.0", "x-forwarded-for": "203.0.113.5", ...headers },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "");
  vi.stubEnv("IP_HASH_SECRET", "test-secret");
  mocks.batch.mockResolvedValue([{}, { rows: [{ id: 1, ts: "2026-09-07T00:00:00Z", reason: "ok", retry_after: 0 }] }]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("guestbook request boundary", () => {
  it.each(["Googlebot/2.1", "Applebot/1.0", "facebookexternalhit/1.1", "curl/8.0", "Mozilla/5.0"])("rejects non-AI UA %s even with fabricated signatures", async (ua) => {
    const res = await POST(request(undefined, { "user-agent": ua, "signature-agent": "https://forged.example", "signature-input": "x", signature: "x" }));
    expect(res.status).toBe(403);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("fails closed without a hash secret or valid client identity", async () => {
    vi.stubEnv("IP_HASH_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("IP_HASH_SECRET", "test-secret");
    expect((await POST(request(undefined, { "x-forwarded-for": "garbage" }))).status).toBe(503);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("validates JSON and fields before performing a transaction", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ name: "", note: "x" })))).status).toBe(400);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("bounds both declared and streamed payload sizes", async () => {
    expect((await POST(request(undefined, { "content-length": "100000" }))).status).toBe(413);
    expect((await POST(request(JSON.stringify({ name: "Agent", note: "x".repeat(9000) })))).status).toBe(413);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("uses a separate lock statement before the quota snapshot and parameterizes user text", async () => {
    const payload = "Robert'); DROP TABLE guestbook_notes; --";
    expect((await POST(request(JSON.stringify({ name: "Agent", note: payload })))).status).toBe(201);
    const queries = mocks.batch.mock.calls[0][0] as SQL[];
    expect(queries).toHaveLength(2);
    const dialect = new PgDialect();
    const lock = dialect.sqlToQuery(queries[0]);
    const insert = dialect.sqlToQuery(queries[1]);
    expect(lock.sql).toMatch(/^select pg_advisory_xact_lock/);
    expect(lock.sql).not.toContain("quota");
    expect(insert.sql).toContain("per_network < 1 and per_day < 50");
    expect(insert.sql).not.toContain("pg_advisory_xact_lock");
    expect(insert.sql).not.toContain(payload);
    expect(insert.params).toContain(payload);
    expect(insert.params).toContain("203.0.113.0/24");
  });

  it.each(["rate-limited", "daily-limit"])("returns Retry-After for %s", async (reason) => {
    mocks.batch.mockResolvedValueOnce([{}, { rows: [{ id: null, ts: null, reason, retry_after: 125 }] }]);
    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("125");
    expect(await res.json()).toEqual({ ok: false, reason, retryAfterSeconds: 125 });
  });

  it("fails closed on database errors without leaking their message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.batch.mockRejectedValueOnce(new Error("private-db-url-and-note"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private");
    expect(error).toHaveBeenCalledWith("guestbook write failed");
  });

  it("preserves the public GET envelope", async () => {
    expect(await (await GET()).json()).toEqual({ notes: [] });
  });
});
