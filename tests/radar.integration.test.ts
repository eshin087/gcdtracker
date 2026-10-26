import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createNeonBridge } from "./support/neon-local";
import { radarJob, radarPurposeWindow } from "../src/lib/ingest/radar";

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
let requests = 0;
let now: Date;
let meta: Record<string, unknown>;
let timestamps: string[];
let responseBody: unknown;
const actualFetch = globalThis.fetch;
beforeAll(async () => { bridge = await createNeonBridge(); });
afterAll(async () => { await bridge?.close(); });
async function cleanup() {
  await bridge.query("delete from external_series where source='radar-v2'");
  await bridge.query("delete from collector_state where key like 'radar:%' or key='radar-attempt:crawl-purpose'");
}
beforeEach(async () => {
  await cleanup();
  now = new Date();
  const window = radarPurposeWindow(now);
  timestamps = Array.from({ length: 28 }, (_, i) => new Date(Date.parse(window.startTime) + i * 86_400_000).toISOString());
  meta = { version: 2, normalization: "PERCENTAGE", units: [{ name: "*", value: "requests" }], dateRange: [window],
    aggInterval: "ONE_DAY", fetchedAt: now.toISOString(), lastUpdated: window.endTime, confidenceInfo: { level: 1, annotations: [] } };
  for (const group of ["bot-share", "crawl-refer", "operator"]) {
    await bridge.query("insert into collector_state(key,state) values($1,$2::jsonb)", ["radar:" + group, JSON.stringify(meta)]);
  }
  responseBody = { success: true, result: { meta, serie_0: { timestamps, TRAINING: timestamps.map(() => "75"), SEARCH: timestamps.map(() => "25") } } };
  requests = 0;
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "qa-fixture-only");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith("https://api.cloudflare.com/client/v4/radar/")) {
      requests++;
      return Response.json(responseBody);
    }
    return actualFetch(input, init);
  });
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await cleanup(); });
function run() { return radarJob({ db: bridge.db, deadline: Date.now() + 30_000 }); }
async function seedPrevious() {
  const previous = { ...meta, fetchedAt: new Date(now.getTime() - 86_400_000).toISOString() };
  await bridge.query("insert into collector_state(key,state) values('radar:crawl-purpose',$1::jsonb)", [JSON.stringify(previous)]);
  await bridge.query("insert into external_series(source,series,period,value) values('radar-v2','crawl-purpose:OBSOLETE','2026-01-01',99),('radar-v2','operator:Existing','2026-01-01',10)");
  return previous;
}

describe("Radar purpose snapshots through the isolated Neon HTTP bridge", () => {
  it("atomically replaces the whole normalized group without touching another group", async () => {
    await seedPrevious();
    expect((await run()).outcome).toBe("success");
    const rows = (await bridge.query("select series,period,value from external_series where source='radar-v2' order by series,period")).rows;
    expect(rows.filter((row) => row.series.startsWith("crawl-purpose:"))).toHaveLength(56);
    expect(rows.some((row) => row.series === "crawl-purpose:OBSOLETE")).toBe(false);
    expect(rows).toContainEqual({ series: "operator:Existing", period: "2026-01-01", value: 10 });
    const checkpoint = (await bridge.query("select state from collector_state where key='radar:crawl-purpose'")).rows[0].state;
    expect(checkpoint.coverage).toMatchObject({ expectedDays: 28, observedDays: 28, missingDays: [] });
    expect(requests).toBe(1);
  });
  it("rolls back replacement and measurement metadata together while retaining the spent attempt", async () => {
    const previous = await seedPrevious();
    await bridge.query("create function qa_fail_radar_write() returns trigger language plpgsql as $$ begin raise exception 'QA injected Radar write failure'; end $$");
    await bridge.query("create trigger qa_fail_radar_write before insert on external_series for each row when (new.source='radar-v2' and new.series like 'crawl-purpose:%') execute function qa_fail_radar_write()");
    try {
      expect((await run()).outcome).toBe("failed");
      expect((await bridge.query("select series,value from external_series where source='radar-v2' and series like 'crawl-purpose:%'")).rows).toEqual([{ series: "crawl-purpose:OBSOLETE", value: 99 }]);
      expect((await bridge.query("select state from collector_state where key='radar:crawl-purpose'")).rows[0].state).toEqual(previous);
      expect((await bridge.query("select state from collector_state where key='radar-attempt:crawl-purpose'")).rows[0].state.day).toBe(now.toISOString().slice(0, 10));
      expect(await run()).toMatchObject({ outcome: "partial", stats: { attemptedToday: ["crawl-purpose"] } });
      expect(requests).toBe(1);
    } finally {
      await bridge.query("drop trigger qa_fail_radar_write on external_series");
      await bridge.query("drop function qa_fail_radar_write()");
    }
  });
  it("allows only one source request when daily invocations race", async () => {
    const reports = await Promise.all([run(), run()]);
    expect(reports.some((report) => report.outcome === "success")).toBe(true);
    expect(reports.every((report) => report.outcome === "success" || report.outcome === "partial")).toBe(true);
    expect(requests).toBe(1);
    expect((await bridge.query("select count(*)::int as n from external_series where source='radar-v2' and series like 'crawl-purpose:%'")).rows[0].n).toBe(56);
    expect((await bridge.query("select revision::int as revision from collector_state where key='radar-attempt:crawl-purpose'")).rows[0].revision).toBe(1);
  });
  it("persists missing-day coverage and null gaps without replacing them with zero", async () => {
    const shortened = timestamps.slice(1);
    responseBody = { success: true, result: { meta, serie_0: { timestamps: shortened, TRAINING: shortened.map((_, i) => i === 0 ? null : "75"), SEARCH: shortened.map(() => "25") } } };
    expect((await run()).outcome).toBe("partial");
    const checkpoint = (await bridge.query("select state from collector_state where key='radar:crawl-purpose'")).rows[0].state;
    expect(checkpoint.coverage).toMatchObject({ observedDays: 26, missingDays: [timestamps[0].slice(0, 10), timestamps[1].slice(0, 10)] });
    expect((await bridge.query("select count(*)::int as n from external_series where source='radar-v2' and series like 'crawl-purpose:%'")).rows[0].n).toBe(53);
    expect((await run()).outcome).toBe("partial");
    expect(requests).toBe(1);
  });
});
