import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRadar, radarSummaryValue, radarJob, radarPurposeEndpoint, radarPurposeWindow } from "./radar";
import { fetchJson } from "./common";
import { commitCollectorState, readCollectorState } from "./state";
import type { Db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("./common", async (original) => ({ ...await original<typeof import("./common")>(), fetchJson: vi.fn() }));
vi.mock("./state", () => ({ readCollectorState: vi.fn(), commitCollectorState: vi.fn() }));
const meta = { normalization: "MIN0_MAX", units: [], dateRange: [{ startTime: "2026-08-01T00:00:00Z", endTime: "2026-08-29T00:00:00Z" }] };
describe("Radar provenance", () => {
  it("preserves normalized snapshot metadata alongside the complete series", () => {
    const parsed = parseRadar("operator", { success: true, result: { meta, serie_0: { timestamps: ["2026-08-01T00:00:00Z"], OpenAI: ["0.4"] } } });
    expect(parsed.metadata.normalization).toBe("MIN0_MAX");
    expect(parsed.rows[0]).toMatchObject({ source: "radar-v2", value: 0.4 });
  });
  it("rejects missing provenance instead of calling normalized values requests", () => {
    expect(() => parseRadar("operator", { success: true, result: { serie_0: { timestamps: [], OpenAI: [] } } })).toThrow(/metadata/);
  });
  it("rejects missing observations instead of converting null to zero", () => {
    expect(() => parseRadar("operator", { success: true, result: { meta, serie_0: { timestamps: ["2026-08-01"], OpenAI: [null] } } })).toThrow(/invalid point/);
  });
});

describe("crawl/referral ratios",()=>{
 it("keeps finite ratios and explicit missing/non-finite metadata",()=>{
  const parsed=parseRadar("crawl-refer",{success:true,result:{meta:{...meta,normalization:"RATIO"},summary_0:{OpenAI:"12.5",Example:"Infinity",Other:null,Empty:"NaN",Ratio:"4:2",Zero:"0"}}});
  expect(parsed.rows.map(r=>r.value)).toEqual([12.5,2,0]);
  expect(parsed.metadata.unavailable).toEqual([
   {series:"crawl-refer:Example",reason:"non-finite"},{series:"crawl-refer:Other",reason:"missing"},{series:"crawl-refer:Empty",reason:"missing"},
  ]);
 });
 it.each([{},[],true,"not-a-ratio",-1])("rejects malformed data %j",value=>expect(()=>radarSummaryValue(value,true)).toThrow());
 it("does not coerce missing values to zero or apply ratio sentinels to unrelated metrics",()=>{
  expect(radarSummaryValue("1:0",true)).toBe("non-finite");expect(radarSummaryValue("0:0",true)).toBe("missing");
  expect(()=>radarSummaryValue(null,false)).toThrow();expect(()=>radarSummaryValue("Infinity",false)).toThrow();
 });
});

const purposeNow = new Date("2026-08-29T12:34:00Z");
const purposeMeta = { ...meta, normalization: "PERCENTAGE", aggInterval: "ONE_DAY", confidenceInfo: { level: 1, annotations: [] } };
function purposeBody(serie: Record<string, unknown>, metadata: Record<string, unknown> = purposeMeta) {
  return { success: true, result: { meta: metadata, serie_0: serie } };
}
describe("Radar crawl-purpose snapshots", () => {
  it("uses a single completed UTC calendar window and preserves source categories and confidence", () => {
    const parsed = parseRadar("crawl-purpose", purposeBody({ timestamps: ["2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"], TRAINING: ["80", "0"], SEARCH: ["20", "100"] }), purposeNow);
    expect(parsed.rows).toContainEqual({ source: "radar-v2", series: "crawl-purpose:TRAINING", period: "2026-08-02", value: 0 });
    expect(parsed.metadata).toMatchObject({ normalization: "PERCENTAGE", aggInterval: "ONE_DAY", confidenceInfo: { level: 1, annotations: [] }, coverage: { expectedDays: 28, observedDays: 2 } });
    expect(parsed.metadata.coverage?.missingDays).toHaveLength(26);
    expect(parsed.metadata.coverage?.missingDays).toContain("2026-08-28");
  });
  it("preserves missing cells and absent dates rather than fabricating zero", () => {
    const parsed = parseRadar("crawl-purpose", purposeBody({ timestamps: ["2026-08-01", "2026-08-03"], TRAINING: [0, null], SEARCH: [100, 100] }), purposeNow);
    expect(parsed.rows.filter((row) => row.series === "crawl-purpose:TRAINING")).toEqual([{ source: "radar-v2", series: "crawl-purpose:TRAINING", period: "2026-08-01", value: 0 }]);
    expect(parsed.metadata.unavailable).toEqual([{ series: "crawl-purpose:TRAINING", period: "2026-08-03", reason: "missing" }]);
    expect(parsed.metadata.coverage?.observedDays).toBe(1);
    expect(parsed.metadata.coverage?.missingDays).toContain("2026-08-02");
    expect(parsed.metadata.coverage?.missingDays).toContain("2026-08-03");
  });
  it("excludes an inclusive endpoint starting an unfinished day", () => {
    const parsed = parseRadar("crawl-purpose", purposeBody({ timestamps: ["2026-08-28", "2026-08-29"], TRAINING: [100, 50] }), purposeNow);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].period).toBe("2026-08-28");
  });
  it.each([true, [], {}, "", " ", "NaN", -1, 101])("rejects malformed or impossible percentages %j", (value) => {
    expect(() => parseRadar("crawl-purpose", purposeBody({ timestamps: ["2026-08-01"], TRAINING: [value] }), purposeNow)).toThrow(/invalid point/);
  });
  it.each([
    { timestamps: ["2026-08-01", "2026-08-01"], TRAINING: [1, 1] },
    { timestamps: ["2026-08-02", "2026-08-01"], TRAINING: [1, 1] },
    { timestamps: ["2026-08-01T01:00:00Z"], TRAINING: [1] },
    { timestamps: ["2026-07-31"], TRAINING: [1] },
    { timestamps: ["2026-08-01"], TRAINING: [] },
    { timestamps: ["2026-08-01"] },
    { timestamps: [], TRAINING: [] },
  ])("rejects malformed time axes and empty payloads", (serie) => {
    expect(() => parseRadar("crawl-purpose", purposeBody(serie), purposeNow)).toThrow();
  });
  it.each([{ ...purposeMeta, normalization: "MIN0_MAX" }, { ...purposeMeta, aggInterval: "ONE_HOUR" }, { ...purposeMeta, aggInterval: undefined }])("rejects altered purpose units and intervals", (metadata) => {
    expect(() => parseRadar("crawl-purpose", purposeBody({ timestamps: ["2026-08-01"], TRAINING: [1] }, metadata), purposeNow)).toThrow();
  });
  it.each([null, [], { success: false }, { success: true, result: { meta: { ...meta, dateRange: [null] } } }, { success: true, result: { meta: { ...meta, units: [null] } } }])("rejects invalid public source envelopes", (body) => {
    expect(() => parseRadar("crawl-purpose", body, purposeNow)).toThrow(/metadata/);
  });
});



describe("bounded Radar collection", () => {
  const now = new Date("2026-08-29T12:34:00Z");
  const ctx = () => ({ db: {} as Db, deadline: now.getTime() + 60_000 });
  const fresh = { ...purposeMeta, version: 2, fetchedAt: "2026-08-29T01:00:00Z", lastUpdated: null };
  const timestamps = Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2026, 7, i + 1)).toISOString());
  const upstream = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "fixture-only");
    vi.stubGlobal("fetch", upstream);
    vi.clearAllMocks();
    vi.mocked(readCollectorState).mockImplementation(async (_db, key) => ({ state: key === "radar:crawl-purpose" || key === "radar-attempt:crawl-purpose" ? {} : fresh, revision: 1 }));
    upstream.mockImplementation(async () => Response.json(purposeBody({ timestamps, TRAINING: timestamps.map(() => "100") })));
    vi.mocked(commitCollectorState).mockResolvedValue(true);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("requests the fixed daily purpose window without unsupported pagination or cardinality limits", async () => {
    expect(radarPurposeWindow(now)).toEqual({ startTime: "2026-08-01T00:00:00.000Z", endTime: "2026-08-29T00:00:00.000Z" });
    const url = new URL("https://example.com" + radarPurposeEndpoint(now));
    expect(Object.fromEntries(url.searchParams)).toEqual({ dateStart: "2026-08-01T00:00:00.000Z", dateEnd: "2026-08-29T00:00:00.000Z", aggInterval: "1d", normalization: "PERCENTAGE" });
    const report = await radarJob(ctx());
    expect(report.outcome).toBe("success");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(fetchJson).not.toHaveBeenCalled();
    expect(upstream).toHaveBeenCalledWith(expect.stringContaining("/ai/bots/timeseries_groups/CRAWL_PURPOSE?"), expect.objectContaining({ signal: expect.any(AbortSignal), redirect: "error" }));
    expect(commitCollectorState).toHaveBeenCalledTimes(2);
    expect(vi.mocked(commitCollectorState).mock.calls[0][1]).toBe("radar-attempt:crawl-purpose");
    const [, key, , next, writes] = vi.mocked(commitCollectorState).mock.calls[1];
    expect(key).toBe("radar:crawl-purpose");
    expect(next.coverage).toMatchObject({ expectedDays: 28, observedDays: 28, missingDays: [] });
    const statements = writes!(sql`revision = ${1}`).map((write) => new PgDialect().sqlToQuery(write));
    expect(statements[0].sql).toContain("delete from external_series");
    expect(statements[0].params).toEqual(["radar-v2", "crawl-purpose:%", 1]);
    expect(statements[1].sql).toContain("where revision = $");
    expect(JSON.parse(statements[1].params[0] as string)).toHaveLength(28);
  });
  it("does not refetch an already committed snapshot on the same UTC day", async () => {
    vi.mocked(readCollectorState).mockResolvedValue({ state: fresh, revision: 2 });
    expect((await radarJob(ctx())).outcome).toBe("success");
    expect(upstream).not.toHaveBeenCalled();
    expect(commitCollectorState).not.toHaveBeenCalled();
  });
  it("refreshes yesterday's snapshot even with less than 24 hours of cron jitter", async () => {
    vi.mocked(readCollectorState).mockImplementation(async (_db, key) => ({ state: key === "radar-attempt:crawl-purpose" ? {} : key === "radar:crawl-purpose" ? { ...fresh, fetchedAt: "2026-08-28T13:00:00Z" } : fresh, revision: 1 }));
    expect((await radarJob(ctx())).outcome).toBe("success");
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("preserves the prior snapshot on access denial, gateway errors and malformed responses without retries", async () => {
    for (const response of [new Response(null, { status: 429 }), new Response(null, { status: 503 }), Response.json(purposeBody({ timestamps, TRAINING: [] }))]) {
      vi.mocked(commitCollectorState).mockClear();
      upstream.mockClear().mockResolvedValueOnce(response);
      expect((await radarJob(ctx())).outcome).toBe("failed");
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(commitCollectorState).toHaveBeenCalledTimes(1);
      expect(vi.mocked(commitCollectorState).mock.calls[0][1]).toBe("radar-attempt:crawl-purpose");
    }
  });
  it("keeps a timeout visible and withholds measurement progress", async () => {
    upstream.mockRejectedValueOnce(new DOMException("Request timed out", "TimeoutError"));
    expect((await radarJob(ctx())).outcome).toBe("failed");
    expect(commitCollectorState).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitCollectorState).mock.calls[0][1]).toBe("radar-attempt:crawl-purpose");
  });
  it("suppresses failed/manual attempts already made today", async () => {
    vi.mocked(readCollectorState).mockImplementation(async (_db, key) => ({ state: key === "radar-attempt:crawl-purpose" ? { day: "2026-08-29" } : key === "radar:crawl-purpose" ? {} : fresh, revision: 1 }));
    expect(await radarJob(ctx())).toMatchObject({ outcome: "partial", stats: { attemptedToday: ["crawl-purpose"] } });
    expect(upstream).not.toHaveBeenCalled();
    expect(commitCollectorState).not.toHaveBeenCalled();
  });
  it("does not request when another invocation wins the attempt revision", async () => {
    vi.mocked(commitCollectorState).mockResolvedValueOnce(false);
    expect((await radarJob(ctx())).outcome).toBe("partial");
    expect(upstream).not.toHaveBeenCalled();
  });
  it("reports a measurement revision race as partial rather than claiming completion", async () => {
    vi.mocked(commitCollectorState).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await radarJob(ctx())).toMatchObject({ outcome: "partial", stats: { rows: 0 } });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("reports incomplete observations as partial even when the snapshot commits", async () => {
    upstream.mockResolvedValueOnce(Response.json(purposeBody({ timestamps: [timestamps[0]], TRAINING: [null] })));
    expect(await radarJob(ctx())).toMatchObject({ outcome: "partial", stats: { unavailable: ["crawl-purpose"] } });
  });
  it("stops before fetching when the shared deadline is nearly exhausted", async () => {
    expect((await radarJob({ ...ctx(), deadline: now.getTime() + 4_000 })).outcome).toBe("partial");
    expect(upstream).not.toHaveBeenCalled();
    expect(readCollectorState).not.toHaveBeenCalled();
  });
  it("does not access source or database when no Radar token is configured", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    expect((await radarJob(ctx())).outcome).toBe("disabled");
    expect(upstream).not.toHaveBeenCalled();
    expect(readCollectorState).not.toHaveBeenCalled();
  });
});
