import { describe, expect, it } from "vitest";
import { GITHUB_AGENTS, flowAgentLabel } from "./github/agents";
import { forumDays, forumLastFullDay } from "./stats";

describe("homepage flow labels", () => {
  it("gives every tracked GitHub detector a distinct label", () => {
    const labels = GITHUB_AGENTS.map(a => flowAgentLabel(a.key, a.tier));
    expect(new Set(labels).size).toBe(labels.length);
    expect(flowAgentLabel("cursor", "bot-account")).toBe("Cursor");
    expect(flowAgentLabel("cursor-branch", "branch-prefix")).toBe("Cursor branches");
    expect(flowAgentLabel("cursor-branch")).toBe("Cursor branches");
    expect(flowAgentLabel("unknown-key", "bot-account")).toBe("unknown-key");
  });
});

describe("forum days", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("ends at the last day a walk finished counting", () => {
    expect(forumLastFullDay("2026-11-09T03:01:00.000Z", now)).toBe("2026-11-08");
    // The walk has not run today: yesterday holds only the hours before the last run.
    expect(forumLastFullDay("2026-11-08T03:01:00.000Z", now)).toBe("2026-11-07");
    expect(forumLastFullDay(null, now)).toBe("2026-11-08");
    expect(forumLastFullDay("not a date", now)).toBe("2026-11-08");
    // A clock ahead of ours never brings the current day in.
    expect(forumLastFullDay("2026-11-11T00:00:00.000Z", now)).toBe("2026-11-08");
  });
  it("keeps a day without a row as a gap and a stored zero as zero", () => {
    const days = forumDays("2026-11-05", "2026-11-07", [{ day: "2026-11-05", posts: 0, agents: 0 }, { day: "2026-11-07", posts: 5800, agents: 900 }], ["2026-11-07"]);
    expect(days).toEqual([
      { day: "2026-11-05", posts: 0, agents: 0, capped: false },
      { day: "2026-11-06", posts: null, agents: null, capped: false },
      { day: "2026-11-07", posts: 5800, agents: 900, capped: true },
    ]);
  });
});
