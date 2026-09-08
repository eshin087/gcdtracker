import { describe, expect, it } from "vitest";
import { parseRadar } from "./radar";
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
