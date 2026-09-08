import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { npmRows, pypiRows } from "./packages";
import { statcounterRows, wikimediaRows, stackOverflowRange, stackOverflowBackoff, monthsBetween } from "./baseline";
import { calendarWindow, dateBefore, isUtcDay } from "./windows";
import { seriesWrites } from "./series-write";
import { completeWatchedPage, splitWatchedWindow } from "./watched";
import type { SearchItem } from "./github";

describe("source payloads retain progress on incomplete or invalid ranges", () => {
  it("requires every npm day, while preserving genuine zeros", () => {
    const rows = [{ day: "2026-08-01", downloads: 0 }, { day: "2026-08-02", downloads: 10 }];
    expect(npmRows("pkg", rows, "2026-08-01", "2026-08-02").map((r) => r.value)).toEqual([0,10]);
    expect(() => npmRows("pkg", rows.slice(1), "2026-08-01", "2026-08-02")).toThrow(/incomplete/);
    expect(() => npmRows("pkg", [rows[0],rows[0]], "2026-08-01", "2026-08-02")).toThrow(/duplicate/);
    expect(() => npmRows("pkg", [{ day: "2026-02-30", downloads: 3 }], "2026-02-28", "2026-03-01")).toThrow(/invalid/);
  });
  it("uses only settled non-mirror PyPI days and refuses an empty settled response", () => {
    const data = [
      { date: "2026-08-01", category: "with_mirrors", downloads: 100 },
      { date: "2026-08-01", category: "without_mirrors", downloads: 7 },
      { date: "2026-08-02", category: "without_mirrors", downloads: 1 },
    ];
    expect(pypiRows("pkg", data, "2026-08-02")).toEqual([{ source: "pypi", series: "pkg", period: "2026-08-01", value: 7 }]);
    expect(() => pypiRows("pkg", data.slice(2), "2026-08-02")).toThrow(/no settled/);
  });
  it("does not mark Wikimedia monthly refresh complete without the requested final month", () => {
    expect(() => wikimediaRows("user", [{ timestamp: "2026070100", views: 10 }], "2026-07", "2026-08")).toThrow(/latest full month missing/);
    expect(wikimediaRows("user", [{ timestamp: "2026080100", views: 0 }], "2026-07", "2026-08")[0].value).toBe(0);
    expect(() => wikimediaRows("user", [{ timestamp: "2026130100", views: 10 }], "2026-07", "2026-12")).toThrow();
  });
  it("does not turn blank StatCounter cells into zero or retire incomplete months", () => {
    expect(() => statcounterRows("Date,Google,Bing\n2026-08,95,", "2026-08")).toThrow(/percentage/);
    expect(() => statcounterRows("Date,Google,Bing\n2026-07,95,5", "2026-08")).toThrow(/latest full month missing/);
    expect(statcounterRows('Date,"Other, combined",Google\n2026-08,5,95', "2026-08")[0].series).toBe("other, combined");
  });
  it("honors inclusive Stack Exchange end dates and persists a future backoff deadline", () => {
    const range = stackOverflowRange("2024-02");
    expect(new Date(range.from*1000).toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(new Date(range.to*1000).toISOString()).toBe("2024-02-29T23:59:59.000Z");
    expect(stackOverflowBackoff(90, Date.parse("2026-09-01T00:00:00Z"))).toBe("2026-09-01T00:01:30.000Z");
    expect(monthsBetween("2025-12", "2026-02")).toEqual(["2025-12","2026-01","2026-02"]);
  });
});

describe("calendar and transactional series boundaries", () => {
  it("uses fixed calendar windows despite missing days, excluding invalid and current observations", () => {
    const rows = ["2026-08-20","2026-08-28","2026-08-31","2026-09-01","2026-08-32"];
    expect(calendarWindow(rows, (r) => r, "2026-08-25", "2026-09-01")).toEqual(["2026-08-28","2026-08-31"]);
    expect(dateBefore("2024-03-01",1)).toBe("2024-02-29");
    expect(isUtcDay("2026-02-29")).toBe(false);
  });
  it("rejects conflicting duplicate series data before SQL writes and deduplicates identical observations", () => {
    const row = { source: "test", series: "x", period: "2026-08", value: 1 };
    expect(seriesWrites([row,row], sql`true`)).toHaveLength(1);
    expect(() => seriesWrites([row,{ ...row, value: 2 }],sql`true`)).toThrow(/conflicting/);
    expect(() => seriesWrites([{...row,value:NaN}],sql`true`)).toThrow(/invalid/);
  });
});

describe("watched PR pagination", () => {
  it("splits into nonoverlapping complete second-resolution windows without offset cursors", () => {
    const split = splitWatchedWindow({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-01T00:00:03.000Z", page: 8 });
    expect(split).toEqual([
      { from: "2026-08-01T00:00:00.000Z", to: "2026-08-01T00:00:01.000Z" },
      { from: "2026-08-01T00:00:02.000Z", to: "2026-08-01T00:00:03.000Z" },
    ]);
    expect(() => splitWatchedWindow({from:split[0].from,to:split[0].from})).toThrow(/timestamp/);
  });
  it("requires the entire one-page window before a checkpoint can advance", () => {
    const item = { id: 1, title: "PR", html_url: "https://github.com/org/repo/pull/1", created_at: "2026-08-01T00:00:00Z", updated_at:"2026-08-02T00:00:00Z" } as SearchItem;
    expect(() => completeWatchedPage(0,[])).not.toThrow();
    expect(() => completeWatchedPage(1,[item])).not.toThrow();
    expect(() => completeWatchedPage(2,[item])).toThrow(/incomplete/);
    expect(() => completeWatchedPage(2,[item,item])).toThrow(/incomplete/);
    expect(() => completeWatchedPage(101,[])).toThrow(/incomplete/);
  });
});
