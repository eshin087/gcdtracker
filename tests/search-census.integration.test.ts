import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createNeonBridge } from "./support/neon-local";
import { querySearchCensusDays } from "../src/lib/stats-census";
import { GITHUB_AGENTS } from "../src/lib/github/agents";
import { SEARCH_CENSUS_SOURCE } from "../src/lib/github/search-census";

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
beforeAll(async () => { bridge = await createNeonBridge(); });
afterAll(async () => { await bridge?.close(); });
beforeEach(async () => {
  await bridge.query("truncate github_daily");
  await bridge.query("delete from external_series where source = $1", [SEARCH_CENSUS_SOURCE]);
});

async function detectors(day: string, prs: number, final = true) {
  for (const a of GITHUB_AGENTS) {
    await bridge.query("insert into github_daily (day, agent, prs, tier, final) values ($1, $2, $3, $4, $5)", [day, a.key, prs, a.tier, final]);
  }
}
async function references(day: string, total: number, overlaps: [number, number, number]) {
  const rows: Array<[string, number]> = [["prs-opened", total], ["overlap:claude", overlaps[0]], ["overlap:cursor", overlaps[1]], ["overlap:codex", overlaps[2]]];
  for (const [series, value] of rows) await bridge.query("insert into external_series (source, series, period, value) values ($1, $2, $3, $4)", [SEARCH_CENSUS_SOURCE, series, day, value]);
}

describe("GitHub search census query against isolated PostgreSQL", () => {
  it("folds stored detector and reference counts into comparable, partial and absent days", async () => {
    await detectors("2026-10-20", 10);
    await references("2026-10-20", 1000, [3, 2, 0]);
    await detectors("2026-10-21", 10, false);
    await references("2026-10-21", 1000, [0, 0, 0]);
    await detectors("2026-10-23", 10);
    await bridge.query("insert into github_daily (day, agent, prs, tier, final) values ('2026-10-23', 'sig-claude-code', 99999, 'text-signature', true)");
    await references("2026-10-23", 1000, [0, 0, 0]);
    const days = await querySearchCensusDays(bridge.db, "2026-10-24");
    expect(days.map((d) => d.day)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(days[0]).toMatchObject({ agentPrs: GITHUB_AGENTS.length * 10 - 5, prsOpened: 1000, partial: false });
    expect(days[1]).toMatchObject({ partial: true, share: null, detectorsFinal: 0 });
    expect(days[2]).toMatchObject({ partial: false, share: null, agentPrs: null });
    expect(days[3]).toMatchObject({ agentPrs: GITHUB_AGENTS.length * 10, partial: false });
  });
  it("excludes the current UTC day and returns nothing before any detector is stored", async () => {
    expect(await querySearchCensusDays(bridge.db, "2026-10-24")).toEqual([]);
    await detectors("2026-10-24", 10);
    await references("2026-10-24", 1000, [0, 0, 0]);
    expect(await querySearchCensusDays(bridge.db, "2026-10-24")).toEqual([]);
  });
});
