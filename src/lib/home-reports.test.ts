import { describe, expect, it, vi } from "vitest";
import { completedMonths, queryHomeReports } from "./home-reports";
import { getArchiveMonthly, getArchiveShareByDay, getArchiveSummary, getRobotsCensus, type ArchivePeriod } from "./stats-census";
import { getSeries } from "./stats-sources";

vi.mock("./stats-census", async importOriginal => ({
  ...await importOriginal<typeof import("./stats-census")>(),
  getArchiveMonthly:vi.fn(),getArchiveShareByDay:vi.fn(),getArchiveSummary:vi.fn(),getRobotsCensus:vi.fn(),
}));
vi.mock("./stats-sources", () => ({getSeries:vi.fn()}));
vi.mock("./db", () => ({db:null}));

describe("multi-year homepage measurements", () => {
  it("restores the full history and preserves missing months instead of truncating to two years", () => {
    const months = completedMonths(["2015-01","2026-08","2026-09","2026-13"],"2026-09-07");
    expect(months).toHaveLength(140);
    expect(months[0]).toBe("2015-01");
    expect(months.at(-1)).toBe("2026-08");
    expect(completedMonths(["2026-04","2026-06"],"2026-09-07"))
      .toEqual(["2026-04","2026-05","2026-06","2026-07","2026-08"]);
    expect(completedMonths([],"2026-09-07")).toEqual([]);
  });
  it("keeps legacy counts while withholding their shares, and excludes the open UTC day", async () => {
    vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
    try {
      const month:ArchivePeriod = {period:"2026-08",hours:744,validatedHours:0,events:2e6,prsOpened:1e6,prsMerged:0,agentPrs:50000,agentMerged:0,byAgent:{},prSignatures:null,commitSignatures:null,commits:null};
      vi.mocked(getArchiveMonthly).mockResolvedValue([month]);
      vi.mocked(getArchiveSummary).mockResolvedValue({latest:null,last7:{days:0,agentPrs:0,prsOpened:0},prior7:{days:0,agentPrs:0,prsOpened:0},firstDay:null,completeDays:0,hours:0});
      vi.mocked(getRobotsCensus).mockResolvedValue([]);
      vi.mocked(getSeries).mockResolvedValue({"all-projects:user":[{period:"2015-01",value:20,lo:null,hi:null}],"all-projects:spider":[{period:"2026-06",value:10,lo:null,hi:null}]});
      const daily = {day:"2026-09-06",hours:24,validatedHours:24,prsOpened:100000,agentPrs:0,share:0,partial:false};
      vi.mocked(getArchiveShareByDay).mockResolvedValue([daily,{...daily,day:"2026-09-07"}]);
      const legacy = await queryHomeReports();
      expect(legacy.github[0]).toMatchObject({agentPrs:50000,share:null,partial:true});
      expect(legacy.wikimedia[0]).toMatchObject({month:"2015-01",human:20,spider:null,automated:null});
      expect(legacy.wikimedia.at(-1)).toEqual({month:"2026-08",human:null,spider:null,automated:null});
      expect(legacy.daily).toHaveLength(1);
      expect(legacy.daily[0]).toMatchObject({day:"2026-09-06",share:0});
      vi.mocked(getArchiveMonthly).mockResolvedValue([{...month,validatedHours:744}]);
      expect((await queryHomeReports()).github[0]).toMatchObject({share:5,partial:false});
    } finally {vi.useRealTimers();}
  });
});
