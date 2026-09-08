import { describe, expect, it } from "vitest";
import { archiveShareRow, isComparableArchivePeriod, type ArchivePeriod } from "./stats-census";
const period = (override: Partial<ArchivePeriod> = {}): ArchivePeriod => ({
  period:"2026-08-30",hours:24,validatedHours:24,events:100000,prsOpened:48000,prsMerged:0,
  agentPrs:100,agentMerged:0,byAgent:{},prSignatures:null,commitSignatures:null,commits:null,...override,
});
describe("archive comparison eligibility", () => {
  it("excludes legacy, incomplete, thin-feed and open periods from comparable ratios", () => {
    expect(isComparableArchivePeriod(period(),"2026-09-01")).toBe(true);
    for(const override of [{validatedHours:0},{validatedHours:23},{hours:23},{prsOpened:100},{period:"2026-09-01"},{period:"2026-02-30"},{partialFeed:true}]) {
      expect(isComparableArchivePeriod(period(override),"2026-09-01")).toBe(false);
    }
  });
  it("requires every calendar hour of a closed month, including leap days", () => {
    expect(isComparableArchivePeriod(period({period:"2024-02",hours:696,validatedHours:696,prsOpened:1_000_000}),"2026-09-01")).toBe(true);
    expect(isComparableArchivePeriod(period({period:"2024-02",hours:672,validatedHours:672,prsOpened:1_000_000}),"2026-09-01")).toBe(false);
  });
  it("keeps non-comparable days as explicit null gaps for calendar and weekday charts", () => {
    const raw = {day:"2026-08-30",hours:24,validatedHours:24,prs:48000,agent:480};
    expect(archiveShareRow(raw,"2026-09-01")).toMatchObject({share:0.01,partial:false});
    expect(archiveShareRow({...raw,validatedHours:0},"2026-09-01")).toMatchObject({share:null,partial:true});
    expect(archiveShareRow({...raw,hours:12},"2026-09-01")).toMatchObject({share:null,partial:true});
  });
});
