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
