import { describe, expect, it } from "vitest";
import { sensorStatus, sourceHealth } from "./health";
const now = Date.parse("2026-09-07T12:00:00Z");
describe("source health", () => {
  it("does not turn partial or failed collection into live success", () => {
    for (const outcome of ["partial", "failed"] as const) {
      const source = sourceHealth({source:"mcp",finishedAt:new Date(now),ok:false,stats:{outcome}},now);
      expect(sensorStatus([source])).toBe("degraded");
    }
  });
  it("uses the source cadence and treats no observations as stale", () => {
    const weekly = sourceHealth({source:"robots-census",finishedAt:new Date(now-86400000),ok:true,stats:{outcome:"success"}},now);
    expect(weekly.stale).toBe(false);
    expect(sourceHealth({...weekly,finishedAt:weekly.lastRun,ok:true,stats:null,source:"github"},now).stale).toBe(true);
    expect(sensorStatus([])).toBe("stale");
  });
  it("does not flag intentionally disabled sources as stale", () => {
    const source = sourceHealth({source:"radar",finishedAt:"2020-01-01",ok:false,stats:{outcome:"disabled"}},now);
    expect(source.stale).toBe(false);
  });
});
