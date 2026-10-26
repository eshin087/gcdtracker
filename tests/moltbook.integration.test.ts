import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createNeonBridge } from "./support/neon-local";
import { MOLTBOOK_STATE_KEY, moltbookJob } from "../src/lib/ingest/moltbook";
import { fetchJson } from "../src/lib/ingest/common";

vi.mock("../src/lib/ingest/common", async (original) => ({ ...await original<typeof import("../src/lib/ingest/common")>(), fetchJson: vi.fn() }));

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
beforeAll(async () => { bridge = await createNeonBridge(); });
afterAll(async () => { await bridge?.close(); });
beforeEach(async () => {
  await bridge.query("truncate forum_posts, forum_daily");
  await bridge.query("delete from collector_state where key = $1", [MOLTBOOK_STATE_KEY]);
  vi.mocked(fetchJson).mockReset();
});

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const post = (id: string, created_at: string, name: string) => ({ id, title: "Post " + id, content: "body text", author: { id: "a-" + name, name }, submolt: { name: "general" }, score: 3, comment_count: 1, created_at });
const page = (posts: unknown[], has_more = false) => ({ status: 200, headers: new Headers(), body: { success: true, posts, has_more, next_cursor: has_more ? "next" : null } });
const ctx = () => ({ db: bridge.db, deadline: Date.now() + 30_000 });

describe("Moltbook feed walk against isolated PostgreSQL", () => {
  it("seeds from stored posts, writes daily counts and the bounded sample, and advances durable coverage", async () => {
    // Fixed UTC-day positions: seed and one new post on yesterday, one new post on today.
    const todayStart = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const seedTs = new Date(todayStart - 23 * 3_600_000).toISOString();
    const lateYesterday = new Date(todayStart - 3_600_000).toISOString();
    const earlyToday = new Date(todayStart + 30_000).toISOString();
    await bridge.query("insert into forum_posts (id, agent, ts, title, url) values ('old-1', 'alpha', $1, 'Old 1', 'https://www.moltbook.com/post/old-1'), ('old-2', 'beta', $1, 'Old 2', 'https://www.moltbook.com/post/old-2')", [seedTs]);
    vi.mocked(fetchJson).mockResolvedValueOnce(page([post("n-3", earlyToday, "gamma"), post("n-2", lateYesterday, "alpha"), post("old-1", seedTs, "alpha")]));
    const first = await moltbookJob(ctx());
    expect(first).toMatchObject({ outcome: "success", stats: { counted: 2, stored: 2, reached: true, daysUpdated: 2 } });
    const daily = (await bridge.query("select day::text as day, posts, agents from forum_daily order by day")).rows as Array<{ day: string; posts: number; agents: number }>;
    expect(daily.find((d) => d.day === seedTs.slice(0, 10))).toMatchObject({ posts: 3, agents: 2 });
    expect(daily.find((d) => d.day === earlyToday.slice(0, 10))).toMatchObject({ posts: 1, agents: 1 });
    expect((await bridge.query("select count(*)::int as n from forum_posts")).rows[0].n).toBe(4);
    const [state] = (await bridge.query("select state from collector_state where key = $1", [MOLTBOOK_STATE_KEY])).rows as Array<{ state: { countedThrough: string; capped: string[] } }>;
    expect(state.state.countedThrough).toBe(earlyToday);
    expect(state.state.capped).toEqual([]);

    // A second walk that only sees already-counted posts changes nothing.
    vi.mocked(fetchJson).mockResolvedValueOnce(page([post("n-3", earlyToday, "gamma")]));
    const second = await moltbookJob(ctx());
    expect(second).toMatchObject({ outcome: "success", stats: { counted: 0, reached: true, daysUpdated: 0 } });
    expect((await bridge.query("select count(*)::int as n from forum_posts")).rows[0].n).toBe(4);
  });
  it("records lower-bound days when the page cap stops the walk before the boundary", async () => {
    let n = 0;
    vi.mocked(fetchJson).mockImplementation(async () => ({ ...page([post("c-" + ++n, iso(n / 10), "agent-" + n)], true), body: { success: true, posts: [post("c-" + n, iso(n / 10), "agent-" + n)], has_more: true, next_cursor: "cursor-" + n } }));
    const result = await moltbookJob(ctx());
    expect(result.outcome).toBe("partial");
    expect(result.stats.reached).toBe(false);
    const [state] = (await bridge.query("select state from collector_state where key = $1", [MOLTBOOK_STATE_KEY])).rows as Array<{ state: { capped: string[] } }>;
    expect(state.state.capped.length).toBeGreaterThan(0);
    const [{ posts }] = (await bridge.query("select coalesce(sum(posts),0)::int as posts from forum_daily")).rows as Array<{ posts: number }>;
    expect(posts).toBe(n);
  });
});
