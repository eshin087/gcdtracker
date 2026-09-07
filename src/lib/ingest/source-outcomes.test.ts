import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { externalSeries, wikiDaily } from "@/lib/db/schema";
import { AGENT_WATCH, agentWatchJob } from "./agentwatch";
import { botcommitsJob } from "./botcommits";
import { ipRangesJob, parsePrefixes } from "./ipranges";
import { moltbookJob } from "./moltbook";
import { wikipediaJob } from "./wikipedia";

const mocked = vi.hoisted(() => ({ fetchJson: vi.fn(), lastCursor: vi.fn(async () => null) }));
vi.mock("./common", async (importOriginal) => ({ ...await importOriginal<typeof import("./common")>(), ...mocked }));

function fixture() {
  const writes: Array<{ table: unknown; values: unknown }> = [];
  const insert = vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      writes.push({ table, values });
      return { onConflictDoUpdate: vi.fn().mockResolvedValue([]), onConflictDoNothing: vi.fn().mockResolvedValue([]) };
    },
  }));
  const remove = vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) }));
  const select = () => ({ from: () => ({
    where: () => Object.assign(Promise.resolve([]), { groupBy: vi.fn().mockResolvedValue([]) }),
  }) });
  return { ctx: { db: { insert, delete: remove, select } as unknown as Db, deadline: Date.now() + 120_000 }, writes, insert, remove };
}
const response = (body: unknown, status = 200) => ({ body, status, headers: new Headers() });
function goodAgentWatch(url: string) {
  if (url === AGENT_WATCH.robots) return response({ ExampleBot: { operator: "Example" } });
  if (url.startsWith(AGENT_WATCH.hfDaily)) return response({ num_rows_total: 0 });
  if (url === AGENT_WATCH.hfModels) return response([{ createdAt: "2026-09-01T01:00:00Z" }, { createdAt: "2026-09-01T00:00:00Z" }]);
  throw new Error("unexpected fetch: " + url);
}
beforeEach(() => {
  mocked.fetchJson.mockReset();
  mocked.lastCursor.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("https://example.com/.well-known/http-message-signatures-directory")));
});
afterEach(() => vi.unstubAllGlobals());

describe("IP range refresh outcomes", () => {
  it("retains all cached ranges and fails on malformed snapshots", async () => {
    const f = fixture();
    mocked.fetchJson.mockResolvedValue(response({ prefixes: [{ ipv4Prefix: "192.0.2.0/24" }, { ipv4Prefix: "999.0.0.0/24" }] }));
    expect((await ipRangesJob(f.ctx)).outcome).toBe("failed");
    expect(f.insert).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
  });
  it("validates prefix families and reports budget exhaustion separately", async () => {
    expect(parsePrefixes({ prefixes: [{ ipv6Prefix: "2001:db8::/129" }] })).toEqual([]);
    expect(parsePrefixes({ prefixes: [{ ipv4Prefix: "192.0.2.0/24" }, { ipv6Prefix: "2001:db8::/32" }] })).toEqual(["192.0.2.0/24", "2001:db8::/32"]);
    const f = fixture();
    expect((await ipRangesJob({ ...f.ctx, deadline: 0 })).outcome).toBe("partial");
    expect(mocked.fetchJson).not.toHaveBeenCalled();
  });
});

describe("AgentWatch source outcomes", () => {
  it("reports complete successful collection", async () => {
    mocked.fetchJson.mockImplementation(async (url: string) => goodAgentWatch(url));
    expect((await agentWatchJob(fixture().ctx)).outcome).toBe("success");
  });
  it("does not call an unavailable HF probe zero traffic or refresh its cached rows", async () => {
    const f = fixture();
    mocked.fetchJson.mockImplementation(async (url: string) => url.startsWith(AGENT_WATCH.hfDaily) ? response(null, 503) : goodAgentWatch(url));
    const result = await agentWatchJob(f.ctx);
    expect(result.outcome).toBe("failed");
    expect(result.stats.failed).toContain("hfDaily");
    expect(result.stats.hfTotal).toBeUndefined();
    expect(f.writes.filter((w) => w.table === externalSeries)).toHaveLength(1); // unrelated Hub interval only
  });
  it("keeps vendored registry usable without claiming a successful live refresh", async () => {
    mocked.fetchJson.mockImplementation(async (url: string) => goodAgentWatch(url));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const result = await agentWatchJob(fixture().ctx);
    expect(result.outcome).toBe("failed");
    expect(result.stats.failed).toContain("registry");
    expect(result.stats.registry).toMatch(/^vendored /);
  });
  it("rejects malformed observations before replacing the usage window", async () => {
    const f = fixture();
    mocked.fetchJson.mockImplementation(async (url: string) => {
      if (url.startsWith(AGENT_WATCH.hfDaily)) return url.endsWith("length=1") ? response({ num_rows_total: 1 }) : response({ rows: [{ row: { day: "2026-09-01", agent: "Example", pct_requests: "bad", pct_users: 1 } }] });
      if (url === AGENT_WATCH.hfModels) return response([{ createdAt: "2026-09-01T00:00:00Z" }, { createdAt: "2026-09-01T00:00:00Z" }]);
      return goodAgentWatch(url);
    });
    expect((await agentWatchJob(f.ctx)).outcome).toBe("failed");
    expect(f.writes.filter((w) => w.table === externalSeries)).toEqual([]);
  });
  it("marks budget-skipped subfeeds partial", async () => {
    const f = fixture();
    expect((await agentWatchJob({ ...f.ctx, deadline: 0 })).outcome).toBe("partial");
    expect(mocked.fetchJson).not.toHaveBeenCalled();
  });
});

describe("Wikipedia source outcomes", () => {
  function wikiFetch(metricStatus: number, missingBotDay = false) {
    mocked.fetchJson.mockImplementation(async (url: string) => {
      if (url.includes("/w/api.php")) return response({ query: { recentchanges: [] } });
      if (url.includes("/group-bot/")) return metricStatus === 200 ? response({ items: [{ results: missingBotDay ? [] : [{ timestamp: "2026-09-01T00:00:00Z", edits: 0 }] }] }) : response(null, metricStatus);
      return response({ items: [{ results: [{ timestamp: "2026-09-01T00:00:00Z", edits: 100 }] }] });
    });
  }
  it("does not erase cached bot/anonymous totals when one metrics API fails", async () => {
    const f = fixture();
    wikiFetch(503);
    expect((await wikipediaJob(f.ctx)).outcome).toBe("failed");
    expect(f.writes.filter((w) => w.table === wikiDaily)).toEqual([]);
  });
  it.each([404, 200])("treats delayed or empty metrics as partial (%i)", async (status) => {
    const f = fixture();
    wikiFetch(status, true);
    expect((await wikipediaJob(f.ctx)).outcome).toBe("partial");
    expect(f.writes.filter((w) => w.table === wikiDaily)).toEqual([]);
  });
  it("preserves genuine zero values when all components are present", async () => {
    const f = fixture();
    wikiFetch(200);
    expect((await wikipediaJob(f.ctx)).outcome).toBe("success");
    expect(f.writes.find((w) => w.table === wikiDaily)?.values).toMatchObject({ bot: 0 });
  });
  it("rejects an HTTP 200 error-shaped recentchanges response", async () => {
    mocked.fetchJson.mockResolvedValue(response({}));
    await expect(wikipediaJob(fixture().ctx)).rejects.toThrow("missing result list");
  });
  it("reports an exhausted scan page cap as partial", async () => {
    mocked.fetchJson.mockImplementation(async (url: string) => url.includes("/w/api.php") ?
      response({ query: { recentchanges: [] }, continue: { rccontinue: "next" } }) :
      response({ items: [{ results: [{ timestamp: "2026-09-01T00:00:00Z", edits: 0 }] }] }));
    expect((await wikipediaJob(fixture().ctx)).outcome).toBe("partial");
  });
});

describe("remaining enabled feeds", () => {
  it("rejects a Moltbook success:false payload", async () => {
    mocked.fetchJson.mockResolvedValue(response({ success: false, posts: [] }));
    await expect(moltbookJob(fixture().ctx)).rejects.toThrow("invalid or failed");
  });
  it("does not claim completion after a filtered page with more upstream data", async () => {
    mocked.fetchJson.mockResolvedValue(response({ success: true, posts: [], has_more: true, next_cursor: "next" }));
    expect((await moltbookJob(fixture().ctx)).outcome).toBe("partial");
  });
  it("marks the Moltbook page cap partial", async () => {
    let page = 0;
    mocked.fetchJson.mockImplementation(async () => response({ success: true, posts: [{ id: String(++page), title: "Post", created_at: new Date().toISOString() }], has_more: true, next_cursor: String(page) }));
    expect((await moltbookJob(fixture().ctx)).outcome).toBe("partial");
    expect(page).toBe(10);
  });
  it.each([{}, { labels: [], tools: {} }, { labels: ["2026-01"], tools: { claude: ["oops"] } }, { labels: ["2026-01"], tools: { claude: [null] } }])("retains botcommits history for malformed/empty payloads", async (body) => {
    const f = fixture();
    mocked.fetchJson.mockResolvedValue(response(body));
    await expect(botcommitsJob(f.ctx)).rejects.toThrow(/botcommits/);
    expect(f.insert).not.toHaveBeenCalled();
  });
  it("accepts measured zero and upstream partial-month labels without marking the collection partial", async () => {
    const f = fixture();
    mocked.fetchJson.mockResolvedValue(response({ labels: ["2026-01"], tools: { claude: [0] }, partial: [true] }));
    expect((await botcommitsJob(f.ctx)).outcome).toBe("success");
    expect(f.writes[0].values).toMatchObject([{ value: 0 }]);
  });
});
