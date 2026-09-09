import { describe, expect, it } from "vitest";
import { parseRadar, radarSummaryValue } from "./radar";
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
