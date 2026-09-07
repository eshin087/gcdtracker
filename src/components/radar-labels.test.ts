import { describe, expect, it } from "vitest";
import { radarUnit, radarValue } from "./radar-labels";
import type { RadarMetadata } from "@/lib/ingest/radar";
const meta = (normalization: string): RadarMetadata => ({ normalization, units: [], dateRange: [{ startTime: "2026-09-01T00:00:00Z", endTime: "2026-09-07T00:00:00Z" }], lastUpdated: null, fetchedAt: "2026-09-07T00:00:00Z", version: 2 });
describe("Radar labels", () => {
  it("does not call normalized indices request counts or add totals", () => expect(radarUnit(meta("MIN_MAX"))).toBe("normalized index"));
  it("formats source percentages without multiplying them", () => expect(radarValue(4.2, meta("PERCENTAGE"))).toBe("4.2%"));
  it("does not invent units when the publisher provides none", () => {
    expect(radarUnit(undefined)).toBe("unit unavailable");
    expect(radarUnit(meta("RAW_VALUES"))).toBe("raw source values");
  });
});
