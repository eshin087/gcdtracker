import { describe, expect, it } from "vitest";
import { GITHUB_AGENTS } from "./agents";
import { botAuthorChunks, foldSearchDays, SEARCH_QUERY_LIMIT, SEARCH_REFERENCES, SEARCH_TOTAL_SERIES, searchWindow, type SearchDetectorRow, type SearchReferenceRow } from "./search-census";
import { searchReferenceWork } from "../ingest/github";

const day = "2026-10-24";
const overlapSeries = SEARCH_REFERENCES.filter((r) => r.series !== SEARCH_TOTAL_SERIES).map((r) => r.series);
const detectors = (prs: (key: string) => number, final = true, d = day): SearchDetectorRow[] => GITHUB_AGENTS.map((a) => ({ day: d, agent: a.key, prs: prs(a.key), final }));
/** All references for a day: total plus overlaps (default zero), with named overrides. */
const refs = (total: number, overrides: Record<string, number> = {}, d = day): SearchReferenceRow[] =>
  [{ period: d, series: SEARCH_TOTAL_SERIES, value: total }, ...overlapSeries.map((series) => ({ period: d, series, value: overrides[series] ?? 0 }))];

describe("GitHub search census v1", () => {
  it("measures every tracked prefix against every tracked bot account in disjoint chunks under the query limit", () => {
    const bots = GITHUB_AGENTS.filter((a) => a.tier === "bot-account").map((a) => a.query);
    for (const prefix of GITHUB_AGENTS.filter((a) => a.tier === "branch-prefix")) {
      const chunks = botAuthorChunks(prefix.query);
      expect(chunks.flat().sort()).toEqual([...bots].sort());
      for (const chunk of chunks) expect(`is:pr created:2026-10-24 ${prefix.query} ${chunk.join(" ")}`.length).toBeLessThanOrEqual(SEARCH_QUERY_LIMIT);
      expect(SEARCH_REFERENCES.filter((r) => r.series.startsWith(`overlap:${prefix.key}:`))).toHaveLength(chunks.length);
    }
  });
  it("subtracts the measured cross-group overlap to give a deduplicated union and share", () => {
    const [result] = foldSearchDays([day], detectors((k) => (k === "claude" ? 404 : k === "claude-branch" ? 91_103 : k === "cursor" ? 2_000 : k === "cursor-branch" ? 5_000 : 10)),
      refs(1_000_000, { "overlap:claude-branch:1": 111, "overlap:claude-branch:2": 1, "overlap:cursor-branch:1": 1051 }));
    const expected = 404 + 91_103 + 2_000 + 5_000 + (GITHUB_AGENTS.length - 4) * 10 - 111 - 1 - 1051;
    expect(result).toMatchObject({ day, agentPrs: expected, prsOpened: 1_000_000, partial: false, detectorsFinal: GITHUB_AGENTS.length, referencesPresent: SEARCH_REFERENCES.length });
    expect(result.share).toBeCloseTo(expected / 1_000_000);
  });
  it("keeps a genuine zero comparable", () => {
    expect(foldSearchDays([day], detectors(() => 0), refs(1_000_000))[0]).toMatchObject({ agentPrs: 0, share: 0, partial: false });
  });
  it("marks a day partial when any detector is provisional or any reference is missing, and absent when nothing was stored", () => {
    const provisional = detectors(() => 5).map((r, i) => (i === 0 ? { ...r, final: false } : r));
    expect(foldSearchDays([day], provisional, refs(1_000_000))[0]).toMatchObject({ partial: true, share: null, detectorsFinal: GITHUB_AGENTS.length - 1 });
    expect(foldSearchDays([day], detectors(() => 5), refs(1_000_000).slice(0, 2))[0]).toMatchObject({ partial: true, share: null, referencesPresent: 2 });
    expect(foldSearchDays(["2026-10-01"], [], [])[0]).toMatchObject({ partial: false, share: null, agentPrs: null });
  });
  it("ignores text-signature and unknown series instead of adding them to the union", () => {
    const rows = [...detectors(() => 1), { day, agent: "sig-claude-code", prs: 200_000, final: true }];
    expect(foldSearchDays([day], rows, [...refs(1_000_000), { period: day, series: "unrelated", value: 9 }])[0].agentPrs).toBe(GITHUB_AGENTS.length);
  });
  it("withholds an impossible union rather than reporting it", () => {
    expect(foldSearchDays([day], detectors(() => 10), refs(5))[0]).toMatchObject({ partial: true, share: null });
  });
  it("sums only comparable days inside the half-open window", () => {
    const days = foldSearchDays(["2026-10-20", "2026-10-21", "2026-10-22"],
      [...detectors(() => 0, true, "2026-10-20"), ...detectors(() => 0, true, "2026-10-21"), ...detectors(() => 0, false, "2026-10-22")],
      [...refs(1_000_000, {}, "2026-10-20"), ...refs(1_000_000, {}, "2026-10-21"), ...refs(1_000_000, {}, "2026-10-22")]);
    expect(searchWindow(days, "2026-10-20", "2026-10-22")).toEqual({ agentPrs: 0, prsOpened: 2_000_000, days: 2 });
    expect(searchWindow(days, "2026-10-21", "2026-10-23")).toEqual({ agentPrs: 0, prsOpened: 1_000_000, days: 1 });
  });
});

describe("search reference work order", () => {
  it("finishes days that already have some references before yesterday, then fills the rest oldest first", () => {
    const have = new Set([`2026-10-20|${SEARCH_TOTAL_SERIES}`, ...SEARCH_REFERENCES.map((r) => `2026-10-21|${r.series}`)]);
    const work = searchReferenceWork(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-24"], "2026-10-24", have);
    const order = [...new Set(work.map((w) => w.day))];
    expect(order).toEqual(["2026-10-20", "2026-10-24", "2026-10-19"]);
    expect(work.filter((w) => w.day === "2026-10-20")).toHaveLength(SEARCH_REFERENCES.length - 1);
    expect(work.some((w) => w.day === "2026-10-21")).toBe(false);
  });
});
