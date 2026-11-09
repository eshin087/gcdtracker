import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db";
import { externalSeries, githubDaily, githubEvents } from "@/lib/db/schema";
import { GITHUB_AGENTS } from "@/lib/github/agents";
import { SEARCH_REFERENCES } from "@/lib/github/search-census";
import { fetchJson, sleep } from "./common";
import { budgetedSearch, catchUpWork, censusGaps, githubJob, RateLimited, resetSearchState, search, searchPause } from "./github";
import { githubSignaturesJob, SIGNATURE_CALLS_PER_RUN, SIGNATURE_QUERIES, signatureWork } from "./github-signatures";
import { commitCollectorState, readCollectorState } from "./state";
import { watchedJob } from "./watched";

// Time only passes through sleep, so pacing and pauses are exact.
vi.mock("./common", async (original) => ({ ...await original<typeof import("./common")>(), fetchJson: vi.fn(), sleep: vi.fn(async (ms: number) => { vi.advanceTimersByTime(ms); }) }));
vi.mock("./state", async (original) => ({ ...await original<typeof import("./state")>(), readCollectorState: vi.fn(), commitCollectorState: vi.fn() }));

const now = new Date("2026-11-09T03:02:00Z");
const GAP = 2_100;
/** The pacing gap, the request timeout and the write that follows. */
const RESERVE = GAP + 12_000 + 2_000;
const day = (back: number) => new Date(now.getTime() - back * 86_400_000).toISOString().slice(0, 10);
const item = { id: 77, number: 5, title: "Example", html_url: "https://github.com/org/repo/pull/5", repository_url: "https://api.github.com/repos/org/repo", created_at: "2026-11-08T10:00:00Z", updated_at: "2026-11-08T11:00:00Z" };
const ok = (headers: Record<string, string> = {}, items: unknown[] = []) => ({ status: 200, headers: new Headers(headers), body: { total_count: items.length || 4, incomplete_results: false, items } });
const refused = (headers: Record<string, string> = {}, status = 403) => ({ status, headers: new Headers(headers), body: { message: "private upstream text" } });
const requests = () => vi.mocked(fetchJson).mock.calls.map(([url]) => decodeURIComponent(String(url)).replaceAll("+", " "));

/** Every detector final and every reference stored for the given days. */
function stored(days: string[], omit: (day: string, key: string) => boolean = () => false) {
  return {
    detectors: days.flatMap((d) => GITHUB_AGENTS.filter((a) => !omit(d, a.key)).map((a) => ({ day: d, agent: a.key, final: true }))),
    references: days.flatMap((d) => SEARCH_REFERENCES.filter((r) => !omit(d, r.series)).map((r) => ({ period: d, series: r.series }))),
  };
}
function censusDb(rows: ReturnType<typeof stored>) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  let first = true;
  const db = {
    select: () => ({ from: (table: unknown) => ({ where: async () => {
      if (table === externalSeries) return rows.references;
      if (first) { first = false; return rows.detectors; }
      return [{ prs: 12 }];
    } }) }),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      inserts.push({ table, values });
      return { onConflictDoUpdate: async () => [], onConflictDoNothing: async () => [] };
    } }),
  };
  return { ctx: (ms = 300_000) => ({ db: db as unknown as Db, deadline: Date.now() + ms }), inserts };
}
const earlier = [2, 3, 4, 5, 6, 7].map(day);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("GITHUB_TOKEN", "fixture-only");
  vi.clearAllMocks();
  resetSearchState();
  vi.mocked(fetchJson).mockImplementation(async () => ok({}, [item]));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("what GitHub asks for after a refusal", () => {
  const at = now.getTime();
  it("follows retry-after first, then the window reset when no requests remain, otherwise one minute", () => {
    expect(searchPause(new Headers({ "retry-after": "30", "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(at / 1000 + 5) }), at)).toEqual({ until: at + 30_000, basis: "retry-after" });
    expect(searchPause(new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(at / 1000 + 12) }), at)).toEqual({ until: at + 12_000, basis: "window-reset" });
    expect(searchPause(new Headers({ "x-ratelimit-remaining": "7", "x-ratelimit-reset": String(at / 1000 + 12) }), at)).toEqual({ until: at + 60_000, basis: "default-minute" });
    expect(searchPause(new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(at / 1000 - 5) }), at)).toEqual({ until: at + 60_000, basis: "default-minute" });
    expect(searchPause(new Headers({ "retry-after": "Mon, 09 Nov 2026 03:05:00 GMT" }), at).basis).toBe("default-minute");
    expect(searchPause(new Headers({ "retry-after": "" }), at).basis).toBe("default-minute");
  });
  it("never honours a pause longer than fifteen minutes", () => {
    expect(searchPause(new Headers({ "retry-after": "86400" }), at).until).toBe(at + 15 * 60_000);
    expect(searchPause(new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(at / 1000 + 86_400) }), at).until).toBe(at + 15 * 60_000);
  });
});

describe("paced, limit-aware search", () => {
  const ctx = (ms: number) => ({ db: {} as Db, deadline: Date.now() + ms });
  it("spaces consecutive calls and uses a short request timeout", async () => {
    await search("is:pr a");
    await search("is:pr b");
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(GAP);
    expect(vi.mocked(fetchJson).mock.calls[0][2]).toBe(12_000);
  });
  it("sends nothing while a refusal's pause is in force, and resumes after it", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(refused({ "retry-after": "5" }));
    await expect(search("is:pr a")).rejects.toMatchObject({ basis: "retry-after", resetAt: now.getTime() + 5_000 });
    await expect(search("is:pr b")).rejects.toBeInstanceOf(RateLimited);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    await expect(search("is:pr c")).resolves.toMatchObject({ incomplete_results: false });
  });
  it("waits out a pause the slice can afford and retries once", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(refused({ "retry-after": "5" }, 429));
    await expect(budgetedSearch(ctx(60_000), "is:pr a")).resolves.toMatchObject({ incomplete_results: false });
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5_250);
  });
  it("gives up without a request when the pause outlasts the slice, and after a second refusal", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(refused({ "retry-after": "60" }));
    await expect(budgetedSearch(ctx(60_000 + RESERVE), "is:pr a")).rejects.toMatchObject({ basis: "retry-after" });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    await expect(budgetedSearch(ctx(30_000), "is:pr b")).rejects.toBeInstanceOf(RateLimited);
    expect(fetchJson).toHaveBeenCalledTimes(1);
    resetSearchState();
    vi.mocked(fetchJson).mockResolvedValueOnce(refused({ "retry-after": "1" })).mockResolvedValueOnce(refused({ "retry-after": "1" }));
    await expect(budgetedSearch(ctx(120_000), "is:pr c")).rejects.toBeInstanceOf(RateLimited);
    expect(fetchJson).toHaveBeenCalledTimes(3);
  });
  it("pauses after the window's last permitted request instead of drawing a refusal", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(ok({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now.getTime() / 1000 + 20) }));
    await search("is:pr a");
    await expect(search("is:pr b")).rejects.toMatchObject({ basis: "window-reset" });
    expect(fetchJson).toHaveBeenCalledTimes(1);
    await expect(budgetedSearch(ctx(90_000), "is:pr c")).resolves.toBeDefined();
    expect(sleep).toHaveBeenCalledWith(20_250);
  });
  it("still reports other failures as errors, without the pause", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce({ status: 422, headers: new Headers(), body: { message: "Validation Failed" } });
    await expect(search("is:pr a")).rejects.toThrow("github search 422");
    await expect(search("is:pr b")).resolves.toBeDefined();
  });
});

describe("census work order", () => {
  it("lists a day's missing detector finals before its missing references", () => {
    const d = day(1);
    const all = censusGaps(d, new Set(), new Set());
    expect(all).toHaveLength(GITHUB_AGENTS.length + SEARCH_REFERENCES.length);
    expect(all.slice(0, GITHUB_AGENTS.length).every((call) => call.agent && !call.ref)).toBe(true);
    const gaps = censusGaps(d, new Set(GITHUB_AGENTS.slice(1).map((a) => `${d}|${a.key}`)), new Set(SEARCH_REFERENCES.slice(2).map((r) => `${d}|${r.series}`)));
    expect(gaps.map((call) => call.agent?.key ?? call.ref!.series)).toEqual([GITHUB_AGENTS[0].key, SEARCH_REFERENCES[0].series, SEARCH_REFERENCES[1].series]);
    expect(censusGaps(d, new Set(GITHUB_AGENTS.map((a) => `${d}|${a.key}`)), new Set(SEARCH_REFERENCES.map((r) => `${d}|${r.series}`)))).toEqual([]);
  });
  it("repairs only the most recent incomplete earlier day", () => {
    const rows = stored(earlier, (d, key) => (d === day(3) && key === SEARCH_REFERENCES[0].series) || d === day(6));
    const work = catchUpWork(earlier, new Set(rows.detectors.map((r) => `${r.day}|${r.agent}`)), new Set(rows.references.map((r) => `${r.period}|${r.series}`)));
    expect(work.map((call) => [call.day, call.ref?.series])).toEqual([[day(3), SEARCH_REFERENCES[0].series]]);
    const complete = stored(earlier);
    expect(catchUpWork(earlier, new Set(complete.detectors.map((r) => `${r.day}|${r.agent}`)), new Set(complete.references.map((r) => `${r.period}|${r.series}`)))).toEqual([]);
  });
});

describe("GitHub census run", () => {
  const perDay = GITHUB_AGENTS.length + SEARCH_REFERENCES.length;
  it("counts the previous day, then takes the sample feed, and asks for nothing else", async () => {
    const f = censusDb(stored(earlier));
    const result = await githubJob(f.ctx());
    expect(result.partial).toBe(false);
    expect(result.stats).toMatchObject({ queries: perDay + 1, yesterday: `${perDay}/${perDay}` });
    expect(result.stats).not.toHaveProperty("sampleFeed");
    expect(result.stats).not.toHaveProperty("catchUp");
    expect(result.stats).not.toHaveProperty("stopped");
    const sent = requests();
    expect(sent.slice(0, perDay).every((url) => url.includes(`created:${day(1)}`))).toBe(true);
    expect(sent[GITHUB_AGENTS.length]).toContain(`q=is:pr created:${day(1)}&`);
    expect(sent[perDay]).toContain("sort=created");
    expect(f.inserts.filter((w) => w.table === githubDaily)).toHaveLength(GITHUB_AGENTS.length);
    expect(f.inserts.filter((w) => w.table === githubDaily).every((w) => (w.values as { final: boolean }).final)).toBe(true);
    expect(f.inserts.filter((w) => w.table === externalSeries)).toHaveLength(SEARCH_REFERENCES.length);
    expect(f.inserts.filter((w) => w.table === githubEvents)).toHaveLength(1);
  });
  it("takes the sample feed even while older days lack reference counts", async () => {
    // Detector counts exist for a month; only days outside the catch-up window lack references.
    const old = Array.from({ length: 23 }, (_, i) => day(8 + i));
    const rows = stored(earlier);
    rows.detectors.push(...stored(old).detectors);
    const result = await githubJob(censusDb(rows).ctx());
    expect(result).toMatchObject({ partial: false, stats: { queries: perDay + 1 } });
    expect(requests().some((url) => old.some((d) => url.includes(d)))).toBe(false);
  });
  it("repairs the newest incomplete earlier day only after the required work", async () => {
    const f = censusDb(stored(earlier, (d, key) => (d === day(3) && (key === GITHUB_AGENTS[0].key || key === SEARCH_REFERENCES[0].series)) || d === day(5)));
    const result = await githubJob(f.ctx());
    expect(result).toMatchObject({ partial: false, stats: { queries: perDay + 3, catchUp: `${day(3)} 2/2` } });
    const sent = requests();
    expect(sent.slice(perDay + 1).every((url) => url.includes(`created:${day(3)}`))).toBe(true);
    expect(sent.some((url) => url.includes(day(5)))).toBe(false);
  });
  it("keeps a completed run successful when the repair of an earlier day fails", async () => {
    vi.mocked(fetchJson).mockImplementation(async (url) => decodeURIComponent(String(url)).includes(day(2))
      ? { status: 200, headers: new Headers(), body: { total_count: 3, incomplete_results: true, items: [] } } : ok({}, [item]));
    const result = await githubJob(censusDb(stored(earlier.slice(1))).ctx());
    expect(result.partial).toBe(false);
    expect(result.stats).toMatchObject({ yesterday: `${perDay}/${perDay}`, catchUp: `${day(2)} 0/${perDay}` });
    expect(String(result.stats.catchUpError)).toContain("incomplete or malformed");
  });
  it("is partial when a refusal the slice cannot wait out interrupts the previous day", async () => {
    let calls = 0;
    vi.mocked(fetchJson).mockImplementation(async () => (++calls > 10 ? refused({ "retry-after": "60" }) : ok()));
    const result = await githubJob(censusDb(stored(earlier)).ctx(45_000));
    expect(result.partial).toBe(true);
    expect(result.stats).toMatchObject({ yesterday: `10/${perDay}`, stopped: "rate limited", sampleFeed: "rate limited", rateLimitBasis: "retry-after", rateLimitedUntil: new Date(now.getTime() + 10 * GAP + 60_000).toISOString() });
    expect(fetchJson).toHaveBeenCalledTimes(11);
  });
  it("waits out a short refusal and still completes", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(refused({ "retry-after": "4" }));
    const result = await githubJob(censusDb(stored(earlier)).ctx());
    expect(result).toMatchObject({ partial: false, stats: { queries: perDay + 1, yesterday: `${perDay}/${perDay}` } });
    expect(sleep).toHaveBeenCalledWith(4_250);
  });
  it("is partial when the slice ends before the previous day and the sample feed are done", async () => {
    const result = await githubJob(censusDb(stored(earlier)).ctx(RESERVE + 5 * GAP));
    expect(result.partial).toBe(true);
    expect(result.stats).toMatchObject({ stopped: "deadline", sampleFeed: "deadline" });
    expect(Number(String(result.stats.yesterday).split("/")[0])).toBeLessThan(perDay);
    expect(result.stats).not.toHaveProperty("sample");
  });
  it("needs only the sample feed when the previous day is already final", async () => {
    const result = await githubJob(censusDb(stored([day(1), ...earlier])).ctx());
    expect(result).toMatchObject({ partial: false, stats: { queries: 1, yesterday: "0/0" } });
  });
});

describe("text-signature work order", () => {
  const keys = SIGNATURE_QUERIES.map((s) => s.key);
  const finalFor = (days: string[]) => new Set(days.flatMap((d) => keys.map((key) => `${d}|${key}`)));
  it("asks for the newly final day and a provisional previous day when nothing older is missing", () => {
    const plan = signatureWork(now, finalFor(earlier.slice(1)));
    expect(plan).toHaveLength(SIGNATURE_CALLS_PER_RUN);
    expect(plan.slice(0, 6).every((call) => call.day === day(2) && call.final && call.required)).toBe(true);
    expect(plan.slice(6).every((call) => call.day === day(1) && !call.final && !call.required)).toBe(true);
  });
  it("fills older gaps newest first before any provisional count, and never refetches a final count", () => {
    const final = new Set([...finalFor([day(4)]), `${day(2)}|${keys[0]}`]);
    const plan = signatureWork(now, final);
    expect(plan.filter((call) => call.required).map((call) => call.signature.key)).toEqual(keys.slice(1));
    expect([...new Set(plan.filter((call) => call.final && !call.required).map((call) => call.day))]).toEqual([day(3), day(5), day(6), day(7)]);
    expect(plan.at(-1)).toMatchObject({ day: day(1), final: false });
    expect(plan.findIndex((call) => !call.final)).toBe(plan.length - keys.length);
  });
});

describe("text-signature run", () => {
  function signatureDb(final: Array<{ day: string; agent: string; final: boolean }>) {
    const writes: Array<{ day: string; agent: string; final: boolean }> = [];
    const db = {
      select: () => ({ from: () => ({ where: async () => final }) }),
      insert: () => ({ values: (values: { day: string; agent: string; final: boolean }) => { writes.push(values); return { onConflictDoUpdate: async () => [] }; } }),
    };
    return { ctx: (ms = 300_000) => ({ db: db as unknown as Db, deadline: Date.now() + ms }), writes };
  }
  const older = earlier.slice(1).flatMap((d) => SIGNATURE_QUERIES.map((s) => ({ day: d, agent: s.key, final: true })));
  it("is disabled without a token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    expect((await githubSignaturesJob(signatureDb([]).ctx())).outcome).toBe("disabled");
    expect(fetchJson).not.toHaveBeenCalled();
  });
  it("stores final counts for the newly final day and provisional counts for the previous day", async () => {
    const f = signatureDb(older);
    expect(await githubSignaturesJob(f.ctx())).toMatchObject({ outcome: "success", stats: { queries: 12, finals: "6/6", provisional: "6/6" } });
    expect(f.writes.filter((w) => w.day === day(2) && w.final)).toHaveLength(6);
    expect(f.writes.filter((w) => w.day === day(1) && !w.final)).toHaveLength(6);
  });
  it("bounds a run that is recovering missed days and reports what is left", async () => {
    const f = signatureDb([]);
    const result = await githubSignaturesJob(f.ctx());
    expect(result).toMatchObject({ outcome: "success", stats: { queries: SIGNATURE_CALLS_PER_RUN, finals: "6/6", provisional: "0/6", pendingFinals: 24 } });
    expect([...new Set(f.writes.map((w) => w.day))]).toEqual([day(2), day(3)]);
  });
  it("is partial only when the newly final day is incomplete", async () => {
    vi.mocked(fetchJson).mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok()).mockResolvedValue(refused({ "retry-after": "60" }));
    expect(await githubSignaturesJob(signatureDb(older).ctx(40_000))).toMatchObject({ outcome: "partial", stats: { finals: "2/6", stopped: "rate limited", rateLimitBasis: "retry-after" } });
    resetSearchState();
    let calls = 0;
    vi.mocked(fetchJson).mockImplementation(async () => (++calls > 8 ? refused({ "retry-after": "60" }) : ok()));
    expect(await githubSignaturesJob(signatureDb(older).ctx(60_000))).toMatchObject({ outcome: "success", stats: { finals: "6/6", provisional: "2/6", stopped: "rate limited" } });
  });
});

describe("watched repository rotation", () => {
  const repo = { repo: "org/a", source: "seed", firstSeen: now, lastPolledAt: null, lastPrAt: null, prCount30d: 0 };
  function watchedCtx(ms = 300_000) {
    const results = [[], [repo], []];
    const chain = (result: unknown) => {
      const promise = Promise.resolve(result) as Promise<unknown> & Record<string, () => unknown>;
      for (const method of ["from", "where", "groupBy", "orderBy", "limit", "values", "onConflictDoNothing", "set", "returning"]) promise[method] = () => promise;
      return promise;
    };
    const db = { select: () => chain(results.shift() ?? []), insert: () => chain([]), update: () => chain([]) };
    return { db: db as unknown as Db, deadline: Date.now() + ms };
  }
  const rotations = () => vi.mocked(commitCollectorState).mock.calls.filter(([, key]) => key === "watched:rotation");
  beforeEach(() => {
    const states = new Map<string, Record<string, unknown>>();
    vi.mocked(readCollectorState).mockImplementation(async (_db, key, fallback) => ({ state: (states.get(key) ?? fallback) as never, revision: 1 }));
    vi.mocked(commitCollectorState).mockImplementation(async (_db, key, _snapshot, next) => { states.set(key, next); return true; });
  });
  it("keeps a repository's turn when GitHub refuses the request", async () => {
    vi.mocked(fetchJson).mockResolvedValue(refused({ "retry-after": "120" }));
    const result = await watchedJob(watchedCtx(60_000));
    expect(result).toMatchObject({ outcome: "partial", stats: { repos: 0, queries: 0, stopped: "rate limited", rateLimitBasis: "retry-after" } });
    expect(rotations()).toHaveLength(0);
  });
  it("advances past a repository that was polled or failed on its own", async () => {
    vi.mocked(fetchJson).mockResolvedValue(ok({}, []));
    vi.mocked(fetchJson).mockResolvedValueOnce({ status: 200, headers: new Headers(), body: { total_count: 0, incomplete_results: false, items: [] } });
    expect(await watchedJob(watchedCtx())).toMatchObject({ outcome: "success", stats: { repos: 1, queries: 1 } });
    expect(rotations()).toHaveLength(1);
    expect(rotations()[0][3]).toEqual({ afterRepo: "org/a" });
    vi.mocked(commitCollectorState).mockClear();
    vi.mocked(fetchJson).mockResolvedValue({ status: 500, headers: new Headers(), body: null });
    const failed = await watchedJob(watchedCtx());
    expect(failed.outcome).toBe("failed");
    expect(rotations()).toHaveLength(1);
  });
});
