import { describe, expect, it, vi } from "vitest";
import { completedMonths, queryHomeReports } from "./home-reports";
import { getArchiveMonthly, getArchiveSummary, getRobotsCensus, type ArchivePeriod } from "./stats-census";
import { getRadarSnapshot, getSeries } from "./stats-sources";

vi.mock("./stats-census", async importOriginal => ({
  ...await importOriginal<typeof import("./stats-census")>(),
  getArchiveMonthly:vi.fn(), getArchiveSummary:vi.fn(), getRobotsCensus:vi.fn(),
}));
vi.mock("./stats-sources", () => ({getRadarSnapshot:vi.fn(),getSeries:vi.fn()}));
vi.mock("./db", () => ({db:null}));

describe("internet homepage reports", () => {
  it("preserves missing and trailing months without inserting current-month observations", () => {
    expect(completedMonths(["2026-04","2026-06","2026-09","2026-13"],"2026-09-07"))
      .toEqual(["2026-04","2026-05","2026-06","2026-07","2026-08"]);
    expect(completedMonths([],"2026-09-07")).toEqual([]);
    expect(completedMonths(["2001-01"],"2026-09-07")).toHaveLength(24);
    expect(completedMonths(["2001-01"],"2026-09-07")[0]).toBe("2024-09");
  });
  it("withholds legacy archive shares and retains publisher normalization metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
    try {
      const month:ArchivePeriod = {period:"2026-08",hours:744,validatedHours:0,events:2e6,prsOpened:1e6,prsMerged:0,agentPrs:50000,agentMerged:0,byAgent:{},prSignatures:null,commitSignatures:null,commits:null};
      vi.mocked(getArchiveMonthly).mockResolvedValue([month]);
      vi.mocked(getArchiveSummary).mockResolvedValue({latest:null,last7:{days:0,agentPrs:0,prsOpened:0},prior7:{days:0,agentPrs:0,prsOpened:0},firstDay:null,completeDays:0,hours:0});
      vi.mocked(getRobotsCensus).mockResolvedValue([]);
      vi.mocked(getSeries).mockResolvedValue({"all-projects:spider":[{period:"2026-06",value:10,lo:null,hi:null}]});
      const meta = {version:2 as const,normalization:"MIN_MAX",units:[],dateRange:[{startTime:"2026-08-31T00:00:00Z",endTime:"2026-09-07T00:00:00Z"}],fetchedAt:"2026-09-07T00:30:00Z",lastUpdated:null};
      vi.mocked(getRadarSnapshot).mockResolvedValue({metadata:{"bot-share":meta},series:{"bot-share:GPTBot":[{period:"2026-09-07",value:0.7,lo:null,hi:null}]}});
      const legacy = await queryHomeReports();
      expect(legacy.github[0]).toMatchObject({agentPrs:50000,share:null,partial:true});
      expect(legacy.wikimedia).toEqual([{month:"2026-06",spider:10,automated:null},{month:"2026-07",spider:null,automated:null},{month:"2026-08",spider:null,automated:null}]);
      expect(legacy.radar).toEqual({meta,bots:[{name:"GPTBot",value:0.7}]});
      vi.mocked(getArchiveMonthly).mockResolvedValue([{...month,validatedHours:744}]);
      expect((await queryHomeReports()).github[0]).toMatchObject({share:5,partial:false});
    } finally {vi.useRealTimers();}
  });
});
