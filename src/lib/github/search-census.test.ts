import { describe, expect, it } from "vitest";
import { GITHUB_AGENTS } from "./agents";
import { foldSearchDays, SEARCH_REFERENCES, searchWindow, type SearchDetectorRow, type SearchReferenceRow } from "./search-census";

const day = "2026-10-24";
const detectors = (prs: (key: string) => number, final = true, d = day): SearchDetectorRow[] => GITHUB_AGENTS.map((a) => ({ day: d, agent: a.key, prs: prs(a.key), final }));
const refs = (values: Record<string, number>, d = day): SearchReferenceRow[] => Object.entries(values).map(([series, value]) => ({ period: d, series, value }));
const fullRefs = { "prs-opened": 1_000_000, "overlap:claude": 111, "overlap:cursor": 1051, "overlap:codex": 0 };

describe("GitHub search census v1", () => {
  it("subtracts measured cross-group overlaps to give a deduplicated union and share", () => {
    const [result] = foldSearchDays([day], detectors((k) => (k === "claude" ? 404 : k === "claude-branch" ? 91_103 : k === "cursor" ? 2_000 : k === "cursor-branch" ? 5_000 : 10)), refs(fullRefs));
    const others = GITHUB_AGENTS.length - 4;
    const expected = 404 + 91_103 + 2_000 + 5_000 + others * 10 - 111 - 1051;
    expect(result).toMatchObject({ day, agentPrs: expected, prsOpened: 1_000_000, partial: false, detectorsFinal: GITHUB_AGENTS.length, referencesPresent: SEARCH_REFERENCES.length });
    expect(result.share).toBeCloseTo(expected / 1_000_000);
  });
  it("keeps a genuine zero comparable", () => {
    const [result] = foldSearchDays([day], detectors(() => 0), refs({ ...fullRefs, "overlap:claude": 0, "overlap:cursor": 0 }));
    expect(result).toMatchObject({ agentPrs: 0, share: 0, partial: false });
  });
  it("marks a day partial when any detector is provisional or any reference is missing, and absent when nothing was stored", () => {
    const provisional = detectors(() => 5).map((r, i) => (i === 0 ? { ...r, final: false } : r));
    expect(foldSearchDays([day], provisional, refs(fullRefs))[0]).toMatchObject({ partial: true, share: null, detectorsFinal: GITHUB_AGENTS.length - 1 });
    expect(foldSearchDays([day], detectors(() => 5), refs({ "prs-opened": 1000 }))[0]).toMatchObject({ partial: true, share: null, referencesPresent: 1 });
    expect(foldSearchDays(["2026-10-01"], [], [])[0]).toMatchObject({ partial: false, share: null, agentPrs: null });
  });
  it("ignores text-signature and unknown series instead of adding them to the union", () => {
    const rows = [...detectors(() => 1), { day, agent: "sig-claude-code", prs: 200_000, final: true }];
    expect(foldSearchDays([day], rows, refs({ ...fullRefs, "overlap:claude": 0, "overlap:cursor": 0, unrelated: 9 }))[0].agentPrs).toBe(GITHUB_AGENTS.length);
  });
  it("withholds an impossible union rather than reporting it", () => {
    expect(foldSearchDays([day], detectors(() => 10), refs({ ...fullRefs, "prs-opened": 5 }))[0]).toMatchObject({ partial: true, share: null });
  });
  it("sums only comparable days inside the half-open window", () => {
    const days = foldSearchDays(["2026-10-20", "2026-10-21", "2026-10-22"], [...detectors(() => 0, true, "2026-10-20"), ...detectors(() => 0, true, "2026-10-21"), ...detectors(() => 0, false, "2026-10-22")],
      [...refs({ ...fullRefs, "overlap:claude": 0, "overlap:cursor": 0 }, "2026-10-20"), ...refs({ ...fullRefs, "overlap:claude": 0, "overlap:cursor": 0 }, "2026-10-21"), ...refs(fullRefs, "2026-10-22")]);
    expect(searchWindow(days, "2026-10-20", "2026-10-22")).toEqual({ agentPrs: 0, prsOpened: 2_000_000, days: 2 });
    expect(searchWindow(days, "2026-10-21", "2026-10-23")).toEqual({ agentPrs: 0, prsOpened: 1_000_000, days: 1 });
  });
});
