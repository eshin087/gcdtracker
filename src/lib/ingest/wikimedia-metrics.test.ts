import { describe, expect, it, vi } from "vitest";
import { fetchEditMetrics, lagDays, metricsWindow, nextDay, previousMonthRange, resolveLoadedWindow } from "./wikimedia-metrics";
import { fetchJson } from "./common";

vi.mock("./common", async (original) => ({ ...await original<typeof import("./common")>(), fetchJson: vi.fn() }));
const response = (body: unknown, status = 200) => ({ body, status, headers: new Headers() });

describe("Wikimedia metrics windows", () => {
  it("requests days after the stored ones and falls back to the last complete month", () => {
    expect(metricsWindow("2026-09-30", "2026-10-25")).toEqual({ start: "2026-10-01", end: "2026-10-23", fallbackEnd: null });
    expect(metricsWindow("2026-09-30", "2026-11-04")).toEqual({ start: "2026-10-01", end: "2026-11-02", fallbackEnd: "2026-10-31" });
    expect(metricsWindow(null, "2026-10-25")).toEqual({ start: "2026-09-01", end: "2026-10-23", fallbackEnd: "2026-09-30" });
    expect(metricsWindow("2026-10-23", "2026-10-25")).toBeNull();
    expect(previousMonthRange("2026-01-15")).toEqual({ first: "2025-12-01", last: "2025-12-31" });
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
    expect(lagDays("2026-09-30", "2026-10-25")).toBe(25);
    expect(lagDays(null)).toBeNull();
  });
  it("treats HTTP 404 as upstream lag and rejects other failures or malformed observations", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(response({ detail: "not loaded" }, 404));
    expect(await fetchEditMetrics("de.wikipedia", "group-bot", "2026-10-01", "2026-10-23")).toBe("not-loaded");
    vi.mocked(fetchJson).mockResolvedValueOnce(response(null, 503));
    await expect(fetchEditMetrics("de.wikipedia", "group-bot", "2026-10-01", "2026-10-23")).rejects.toThrow(/503/);
    vi.mocked(fetchJson).mockResolvedValueOnce(response({ items: [{ results: [{ timestamp: "2026-10-01T00:00:00Z", edits: -1 }] }] }));
    await expect(fetchEditMetrics("de.wikipedia", "group-bot", "2026-10-01", "2026-10-23")).rejects.toThrow(/invalid/);
    expect(vi.mocked(fetchJson).mock.calls[0][0]).toContain("/de.wikipedia/group-bot/all-page-types/daily/20261001/20261023");
  });
  it("probes the recent window, then the complete month, before giving up for this run", async () => {
    const window = { start: "2026-10-01", end: "2026-11-02", fallbackEnd: "2026-10-31" };
    vi.mocked(fetchJson).mockResolvedValueOnce(response(null, 404)).mockResolvedValueOnce(response({ items: [{ results: [{ timestamp: "2026-10-01T00:00:00Z", edits: 5 }] }] }));
    expect(await resolveLoadedWindow("de.wikipedia", "all-editor-types", window)).toMatchObject({ end: "2026-10-31" });
    vi.mocked(fetchJson).mockResolvedValueOnce(response(null, 404));
    expect(await resolveLoadedWindow("de.wikipedia", "all-editor-types", { ...window, fallbackEnd: null })).toBeNull();
    vi.mocked(fetchJson).mockResolvedValueOnce(response(null, 404)).mockResolvedValueOnce(response(null, 404));
    expect(await resolveLoadedWindow("de.wikipedia", "all-editor-types", window)).toBeNull();
  });
});
