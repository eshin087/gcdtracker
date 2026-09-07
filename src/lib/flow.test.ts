import { describe, expect, it } from "vitest";
import { DEMO_FLOW } from "./demo-flow";
import { destinationCounts, flowWeight } from "./flow";

describe("dashboard comparison scales", () => {
  it("compares only matching sources and units", () => {
    const [copilot, claude] = DEMO_FLOW.sources;
    expect(flowWeight(claude, DEMO_FLOW.sources)).toBeCloseTo(7360 / 12840);
    expect(flowWeight(copilot, DEMO_FLOW.sources)).toBe(1);
    const commons = DEMO_FLOW.sources.find(s => s.id === "wiki:commons")!;
    expect(flowWeight(commons, DEMO_FLOW.sources)).toBe(1);
  });
  it("keeps files separate from edit counts at shared destinations", () => {
    expect(destinationCounts("wikis", DEMO_FLOW)).toBe("24,520 edits · 320 files");
    expect(destinationCounts("code", DEMO_FLOW)).toBe("25,020 PR matches");
    expect(destinationCounts("missing", DEMO_FLOW)).toBe("No observations");
  });
  it("does not rescale when an unrelated feed grows", () => {
    const source = DEMO_FLOW.sources[1];
    const larger = DEMO_FLOW.sources.map(s => s.feed === "visits" ? {...s, total: 1e9} : s);
    expect(flowWeight(source, larger)).toBe(flowWeight(source, DEMO_FLOW.sources));
  });
  it("handles zero counts without invalid path widths", () => {
    const empty = {...DEMO_FLOW.sources[0], total: 0};
    expect(flowWeight(empty, [empty])).toBe(0);
  });
});
