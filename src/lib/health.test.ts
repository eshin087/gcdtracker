import { describe, expect, it } from "vitest";
import { sensorStatus, sourceHealth } from "./health";

const now = Date.parse("2026-09-11T12:00:00Z");
const day = 86_400_000;

describe("source health", () => {
  it.each(["github", "radar", "bluesky", "mastodon"])("uses the daily schedule for %s", (source) => {
    const health = sourceHealth({ source, finishedAt: new Date(now - day), ok: true, stats: { outcome: "success" } }, now);
    expect(health).toMatchObject({ expectedIntervalSeconds: 86_400, schedule: "daily", stale: false });
    expect(sensorStatus([health])).toBe("live");
  });

  it("becomes stale only after the existing two-interval grace period", () => {
    const run = { source: "radar", finishedAt: new Date(now - 2 * day), ok: true, stats: { outcome: "success" } };
    expect(sourceHealth(run, now).stale).toBe(false);
    const overdue = sourceHealth(run, now + 1);
    expect(overdue.stale).toBe(true);
    expect(sensorStatus([overdue])).toBe("stale");
  });

  it.each(["partial", "failed"] as const)("does not turn an enabled %s collection into live success", (outcome) => {
    const health = sourceHealth({ source: "mcp", finishedAt: new Date(now), ok: false, stats: { outcome } }, now);
    expect(sensorStatus([health])).toBe("degraded");
  });

  it.each(["gharchive", "robots-census", "ai-robots-history"])("preserves the historical %s outcome without degrading scheduled health", (source) => {
    const recent = sourceHealth({ source: "github", finishedAt: new Date(now), ok: true, stats: null }, now);
    for (const outcome of ["success", "partial", "failed"] as const) {
      const historical = sourceHealth({ source, finishedAt: "2020-01-01T00:00:00Z", ok: outcome === "success", stats: { outcome } }, now);
      expect(historical).toMatchObject({ outcome, lastRun: "2020-01-01T00:00:00.000Z", schedule: "unscheduled", expectedIntervalSeconds: 0, stale: false });
      expect(sensorStatus([recent, historical])).toBe("live");
      expect(sensorStatus([historical])).toBe("stale");
    }
  });

  it("ignores disabled sources without implying live collection when all sources are disabled", () => {
    const disabled = sourceHealth({ source: "radar", finishedAt: "2020-01-01", ok: false, stats: { outcome: "disabled" } }, now);
    const recent = sourceHealth({ source: "bluesky", finishedAt: new Date(now), ok: true, stats: null }, now);
    expect(disabled.stale).toBe(false);
    expect(sensorStatus([disabled, recent])).toBe("live");
    expect(sensorStatus([disabled])).toBe("stale");
    expect(sensorStatus([])).toBe("stale");
  });

  it("preserves legacy outcome inference and explicit-outcome precedence", () => {
    const run = { source: "mcp", finishedAt: new Date(now), ok: false };
    expect(sourceHealth({ ...run, stats: { partial: true } }, now).outcome).toBe("partial");
    expect(sourceHealth({ ...run, stats: { skipped: true } }, now).outcome).toBe("disabled");
    expect(sourceHealth({ ...run, stats: { skipped: true, outcome: "failed" } }, now).outcome).toBe("failed");
    expect(sourceHealth({ ...run, stats: null }, now).outcome).toBe("failed");
  });
});
