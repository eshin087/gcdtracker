import { describe, it, expect } from "vitest";
import { readingLines } from "./reading-report";
import { DEMO_READING } from "./demo-social";
describe("crawler purpose report", () => {
  it("preserves missing days as gaps rather than joining observations", () => {
    const series = readingLines(DEMO_READING);
    expect(series).toHaveLength(3);
    expect(series[0].points).toHaveLength(28);
    expect(series[0].points[12].y).toBeNull();
    expect(series[0].points[11].y).not.toBeNull();
    expect(series[0].points[13].y).not.toBeNull();
  });
  it("withholds untyped or legacy groups", () => {
    expect(readingLines({metadata:{},series:DEMO_READING.series})).toEqual([]);
  });
});
