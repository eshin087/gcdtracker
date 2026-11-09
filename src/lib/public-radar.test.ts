import { describe, expect, it } from "vitest";
import { publicRadarMetadata, readRadarMetadata } from "./public-radar";

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
  { normalization: "" },
  { dateRange: [{ startTime: "2026-09-07", endTime: "2026-08-01" }] },
  { coverage: { startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", expectedDays: 28, observedDays: 28, missingDays: ["2026-09-01"] } },
  { coverage: { startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z", expectedDays: 28, observedDays: 27, missingDays: ["2027-09-01"] } },
])("rejects a contradictory window, normalization or coverage", (invalid) => {
  expect(readRadarMetadata({ ...state, ...invalid })).toEqual({ metadata: null, dropped: [] });
  expect(publicRadarMetadata({ ...state, ...invalid })).toBeNull();
});

describe("supplementary publisher fields", () => {
  const event = { dataSource: "BOTS", description: "Classification update", eventType: "PIPELINE", isInstantaneous: false };
  it("keeps the measurement and names each field it leaves out", () => {
    const read = readRadarMetadata({ ...state, lastUpdated: "invalid", aggInterval: 7, units: [{ name: "requests", value: 1 }, { name: "*", value: "requests" }],
      confidenceInfo: { level: 2, annotations: [null, { ...event, startDate: "not a date" }, { ...event, startDate: "2026-09-01T00:00:00Z", endDate: "2026-09-02T00:00:00Z" }] } });
    expect(read.dropped).toEqual(["unit", "lastUpdated", "aggInterval", "annotation", "annotation"]);
    expect(read.metadata).toMatchObject({ normalization: "MIN0_MAX", dateRange: [{ startTime: "2026-08-10T00:00:00Z", endTime: "2026-09-07T00:00:00Z" }],
      units: [{ name: "*", value: "requests" }], lastUpdated: null, confidenceInfo: { level: 2, annotations: [{ eventType: "PIPELINE", endDate: "2026-09-02T00:00:00Z" }] } });
    expect(read.metadata).not.toHaveProperty("aggInterval");
  });
  it("keeps open-ended and instantaneous annotations with the absent date recorded as null", () => {
    const read = readRadarMetadata({ ...state, confidenceInfo: { level: 5, annotations: [
      { ...event, startDate: "2026-09-01T00:00:00Z" }, { ...event, isInstantaneous: true, endDate: null }] } });
    expect(read.dropped).toEqual([]);
    expect(read.metadata?.confidenceInfo?.annotations).toEqual([
      { ...event, startDate: "2026-09-01T00:00:00Z", endDate: null }, { ...event, isInstantaneous: true, startDate: null, endDate: null }]);
    // A stored snapshot read back for public output keeps the same annotations.
    expect(publicRadarMetadata(read.metadata)?.confidenceInfo?.annotations).toHaveLength(2);
  });
  it.each([{ confidenceInfo: { level: "1", annotations: [] } }, { confidenceInfo: "none" }, { confidenceInfo: { level: 1 } }])("omits unusable confidence information without rejecting the snapshot", (invalid) => {
    const read = readRadarMetadata({ ...state, ...invalid });
    expect(read.dropped).toEqual(["confidenceInfo"]);
    expect(read.metadata).not.toHaveProperty("confidenceInfo");
    expect(read.metadata?.normalization).toBe("MIN0_MAX");
  });
  it("treats explicit nulls as absent rather than malformed", () => {
    expect(readRadarMetadata({ ...state, units: null, lastUpdated: null, aggInterval: null, confidenceInfo: null })).toMatchObject({ dropped: [], metadata: { units: [], lastUpdated: null } });
  });
});
