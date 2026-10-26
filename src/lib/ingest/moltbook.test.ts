import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { MOLTBOOK_LIMITS, MOLTBOOK_STATE_KEY, moltbookJob, type MoltbookCoverage } from "./moltbook";
import { fetchJson } from "./common";
import { commitCollectorState, readCollectorState } from "./state";

vi.mock("./common", async (original) => ({ ...await original<typeof import("./common")>(), fetchJson: vi.fn() }));
vi.mock("./state", async (original) => ({ ...await original<typeof import("./state")>(), readCollectorState: vi.fn(), commitCollectorState: vi.fn() }));

const now = new Date("2026-10-25T03:47:00Z");
const response = (body: unknown, status = 200) => ({ body, status, headers: new Headers() });
const post = (id: string, created_at: string, name: string) => ({ id, title: "Post " + id, content: "body", author: { id: 7, name }, created_at });
const page = (posts: unknown[], has_more = true, next_cursor: string | null = "cursor-" + posts.length) => response({ success: true, posts, has_more, next_cursor });
let seeded: unknown[] = [];
const execute = vi.fn(async () => ({ rows: seeded }));
const ctx = (deadline = now.getTime() + 60_000) => ({ db: { execute } as unknown as Db, deadline });
const previous: MoltbookCoverage = { version: 1, countedThrough: "2026-10-24T03:00:00.000Z", days: { "2026-10-24": { posts: 100, agents: ["alpha"] } }, capped: [] };
const committed = () => {
  const [, key, , next, writes] = vi.mocked(commitCollectorState).mock.calls.at(-1)!;
  return { key, next: next as MoltbookCoverage, statements: writes!(sql`guard`).map((w) => new PgDialect().sqlToQuery(w)) };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  seeded = [];
  vi.mocked(readCollectorState).mockResolvedValue({ state: previous, revision: 3 });
  vi.mocked(commitCollectorState).mockResolvedValue(true);
});
afterEach(() => vi.useRealTimers());

describe("Moltbook daily feed walk", () => {
  it("rejects a success:false payload before touching counts", async () => {
    vi.mocked(fetchJson).mockResolvedValue(response({ success: false, posts: [] }));
    await expect(moltbookJob(ctx())).rejects.toThrow("invalid or failed");
    expect(commitCollectorState).not.toHaveBeenCalled();
  });
  it("counts back to the previous boundary, merges open days and commits counts with a bounded post sample", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(page([post("3", "2026-10-25T01:00:00Z", "beta"), post("2", "2026-10-24T23:00:00Z", "alpha"), post("1", "2026-10-24T02:00:00Z", "old")]));
    const result = await moltbookJob(ctx());
    expect(result).toMatchObject({ outcome: "success", stats: { pages: 1, counted: 2, stored: 2, reached: true, daysUpdated: 2, cappedDays: [] } });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetchJson).mock.calls[0][0]).toContain("limit=" + MOLTBOOK_LIMITS.pageSize);
    const { key, next, statements } = committed();
    expect(key).toBe(MOLTBOOK_STATE_KEY);
    expect(next.countedThrough).toBe("2026-10-25T01:00:00.000Z");
    expect(next.days).toEqual({ "2026-10-24": { posts: 101, agents: ["alpha"] }, "2026-10-25": { posts: 1, agents: ["beta"] } });
    expect(statements[0].sql).toContain("insert into forum_daily");
    expect(JSON.parse(statements[0].params[0] as string)).toEqual([{ day: "2026-10-25", posts: 1, agents: 1 }, { day: "2026-10-24", posts: 101, agents: 1 }]);
    expect(statements[1].sql).toContain("insert into forum_posts");
    expect(JSON.parse(statements[1].params[0] as string)).toHaveLength(2);
    expect(statements[1].params[0]).not.toContain('"id":"1"');
  });
  it("marks the days between the oldest counted post and the boundary as lower bounds when a walk stops early", async () => {
    vi.mocked(fetchJson).mockImplementation(async () => {
      vi.advanceTimersByTime(1_000);
      return page([post("9", "2026-10-25T02:00:00Z", "gamma"), post("8", "2026-10-25T01:00:00Z", "delta")]);
    });
    const result = await moltbookJob(ctx(now.getTime() + 10_500));
    expect(result).toMatchObject({ outcome: "partial", stats: { pages: 1, counted: 2, reached: false, cappedDays: ["2026-10-24", "2026-10-25"] } });
    const { next } = committed();
    expect(next.capped).toEqual(["2026-10-24", "2026-10-25"]);
    expect(next.countedThrough).toBe("2026-10-25T02:00:00.000Z");
  });
  it("does not advance coverage when the checkpoint commit loses a race", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(page([post("3", "2026-10-25T01:00:00Z", "beta")], false, null));
    vi.mocked(commitCollectorState).mockResolvedValueOnce(false);
    expect(await moltbookJob(ctx())).toMatchObject({ outcome: "partial", stats: { reason: "coverage checkpoint superseded" } });
  });
  it("seeds the first walk from the posts the earlier bounded poller stored", async () => {
    vi.mocked(readCollectorState).mockResolvedValue({ state: { version: 1, countedThrough: null, days: {}, capped: [] }, revision: 0 });
    seeded = [{ day: "2026-10-24", posts: 500, agents: ["x", "y"], newest_ms: String(Date.UTC(2026, 9, 24, 3)) }];
    vi.mocked(fetchJson).mockResolvedValueOnce(page([post("5", "2026-10-24T22:00:00Z", "x"), post("4", "2026-10-24T21:00:00Z", "z"), post("1", "2026-10-24T02:59:00Z", "old")]));
    expect(await moltbookJob(ctx())).toMatchObject({ outcome: "success", stats: { counted: 2, reached: true, boundary: "2026-10-24T03:00:00.000Z" } });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(committed().next.days["2026-10-24"]).toEqual({ posts: 502, agents: ["x", "y", "z"] });
  });
  it("stops after the page cap and keeps the walk partial", async () => {
    let n = 0;
    vi.mocked(fetchJson).mockImplementation(async () => page([post(String(++n), new Date(now.getTime() - n * 1000).toISOString(), "a" + n)], true, "cursor-" + n));
    const result = await moltbookJob(ctx());
    expect(result.outcome).toBe("partial");
    expect(result.stats.pages).toBe(MOLTBOOK_LIMITS.maxPages);
  });
});
