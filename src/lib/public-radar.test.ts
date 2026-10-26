import { describe, expect, it } from "vitest";
import { publicRadarMetadata } from "./public-radar";

const state = {
  version: 2, normalization: "MIN0_MAX", units: [{ name: "requests", value: "NORMALIZED", extra: "private" }],
  dateRange: [{ startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", extra: "private" }],
  fetchedAt: "2026-09-07T01:00:00Z", lastUpdated: "2026-09-07T00:00:00Z",
  cursor: "private", revision: 4, token: "private",
};
describe("public Radar metadata", () => {
  it("publishes units, normalization, window and retrieval dates with no collector internals", () => {
    expect(publicRadarMetadata(state)).toEqual({
      version: 2, normalization: "MIN0_MAX", units: [{ name: "requests", value: "NORMALIZED" }],
      dateRange: [{ startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z" }],
      fetchedAt: state.fetchedAt, lastUpdated: state.lastUpdated,
    });
    expect(JSON.stringify(publicRadarMetadata(state))).not.toContain("private");
  });
  it.each([null, {}, { ...state, version: 1 }, { ...state, dateRange: [] }, { ...state, fetchedAt: "invalid" }])("rejects missing/legacy/invalid measurement contracts", (value) => {
    expect(publicRadarMetadata(value)).toBeNull();
  });
});

it("allowlists unavailable measurements without exposing additional state",()=>{
 const metadata=publicRadarMetadata({...state,unavailable:[{series:"crawl-refer:Example",reason:"non-finite",secret:"private"},{series:"bad",reason:"private"}]});
 expect(metadata?.unavailable).toEqual([{series:"crawl-refer:Example",reason:"non-finite"}]);
 expect(JSON.stringify(metadata)).not.toContain("private");
});

it("preserves source confidence, daily coverage and missing-cell dates without collector internals", () => {
  const result = publicRadarMetadata({ ...state, aggInterval: "ONE_DAY", confidenceInfo: { level: 1, secret: "private", annotations: [{
    dataSource: "AI_BOTS", description: "Source pipeline delay", startDate: "2026-09-01T00:00:00Z", endDate: "2026-09-02T00:00:00Z", eventType: "PIPELINE", isInstantaneous: false, secret: "private",
  }] }, coverage: { startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", expectedDays: 28, observedDays: 27, missingDays: ["2026-09-01"], token: "private" },
    unavailable: [{ series: "crawl-purpose:TRAINING", reason: "missing", period: "2026-09-01", token: "private" }],
  });
  expect(result?.coverage).toEqual({ startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", expectedDays: 28, observedDays: 27, missingDays: ["2026-09-01"] });
  expect(result?.confidenceInfo?.annotations[0].eventType).toBe("PIPELINE");
  expect(result?.unavailable?.[0].period).toBe("2026-09-01");
  expect(JSON.stringify(result)).not.toContain("private");
});
it.each([
  { confidenceInfo: { level: "1", annotations: [] } },
  { confidenceInfo: { level: 1, annotations: [null] } },
  { lastUpdated: "invalid" },
  { units: [{ name: "requests", value: 1 }] },
  { dateRange: [{ startTime: "2026-09-07", endTime: "2026-08-01" }] },
  { coverage: { startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", expectedDays: 28, observedDays: 28, missingDays: ["2026-09-01"] } },
  { coverage: { startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", expectedDays: 28, observedDays: 27, missingDays: ["2027-09-01"] } },
])("rejects contradictory or malformed source metadata", (invalid) => {
  expect(publicRadarMetadata({ ...state, ...invalid })).toBeNull();
});
