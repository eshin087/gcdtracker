import { fetchJson, type Job, sleep, timeLeft } from "./common";
import { commitSeries, readCollectorState, type SeriesRow } from "./series-write";
import { commitCollectorState } from "./state";
import { dateBefore, isUtcDay } from "./windows";

export interface TrackedPackage {
  registry: "npm" | "pypi";
  name: string;
  label: string;
  vendor: string;
  /** what the package is: an agent people run, or a library agents are built from */
  role: "agent" | "framework";
}

/** Verified on 2026-09-06 against api.npmjs.org and pypistats.org. */
export const PACKAGES: TrackedPackage[] = [
  { registry: "npm", name: "@anthropic-ai/claude-code", label: "Claude Code", vendor: "Anthropic", role: "agent" },
  { registry: "npm", name: "@openai/codex", label: "Codex CLI", vendor: "OpenAI", role: "agent" },
  { registry: "npm", name: "@github/copilot", label: "Copilot CLI", vendor: "GitHub", role: "agent" },
  { registry: "npm", name: "@google/gemini-cli", label: "Gemini CLI", vendor: "Google", role: "agent" },
  { registry: "npm", name: "opencode-ai", label: "OpenCode", vendor: "SST", role: "agent" },
  { registry: "npm", name: "@qwen-code/qwen-code", label: "Qwen Code", vendor: "Alibaba", role: "agent" },
  { registry: "npm", name: "@modelcontextprotocol/sdk", label: "MCP SDK (TypeScript)", vendor: "Anthropic", role: "framework" },
  { registry: "npm", name: "@anthropic-ai/claude-agent-sdk", label: "Claude Agent SDK", vendor: "Anthropic", role: "framework" },
  { registry: "npm", name: "@openai/agents", label: "OpenAI Agents SDK", vendor: "OpenAI", role: "framework" },
  { registry: "pypi", name: "aider-chat", label: "Aider", vendor: "Aider", role: "agent" },
  { registry: "pypi", name: "openhands-ai", label: "OpenHands", vendor: "All Hands AI", role: "agent" },
  { registry: "pypi", name: "browser-use", label: "Browser Use", vendor: "Browser Use", role: "agent" },
  { registry: "pypi", name: "mcp", label: "MCP SDK (Python)", vendor: "Anthropic", role: "framework" },
  { registry: "pypi", name: "openai-agents", label: "OpenAI Agents SDK (Python)", vendor: "OpenAI", role: "framework" },
  { registry: "pypi", name: "claude-agent-sdk", label: "Claude Agent SDK (Python)", vendor: "Anthropic", role: "framework" },
  { registry: "pypi", name: "crewai", label: "CrewAI", vendor: "CrewAI", role: "framework" },
];

export const PACKAGE_SOURCES = { npm: "https://api.npmjs.org/downloads/range/", pypi: "https://pypistats.org/api/packages/" } as const;

/** npm keeps daily counts since 2015 but serves at most 18 months per call. */
const NPM_BACKFILL_FROM = "2024-01-01";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** A partial/malformed npm range must not retire its backfill window. */
export function npmRows(name: string, downloads: Array<{ day: string; downloads: number }>, start: string, end: string): SeriesRow[] {
  const byDay = new Map<string, number>();
  for (const row of downloads) {
    if (!isUtcDay(row.day) || !Number.isSafeInteger(row.downloads) || row.downloads < 0 || row.day < start || row.day > end || byDay.has(row.day)) throw new Error("invalid or duplicate npm daily observation");
    byDay.set(row.day, row.downloads);
  }
  const expected = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  if (expected < 1 || byDay.size !== expected) throw new Error("npm range is incomplete; retaining checkpoint");
  return [...byDay].map(([period, value]) => ({ source: "npm", series: name, period, value }));
}
export function pypiRows(name: string, data: Array<{ category: string; date: string; downloads: number }>, cutoff: string): SeriesRow[] {
  const byDay = new Map<string, number>();
  for (const row of data) {
    if (row.category !== "without_mirrors") continue;
    if (!isUtcDay(row.date) || !Number.isSafeInteger(row.downloads) || row.downloads < 0) throw new Error("invalid PyPI observation");
    if (row.date >= cutoff) continue;
    if (byDay.has(row.date) && byDay.get(row.date) !== row.downloads) throw new Error("conflicting PyPI observation");
    byDay.set(row.date, row.downloads);
  }
  if (!byDay.size) throw new Error("PyPI supplied no settled observations; retaining checkpoint");
  return [...byDay].map(([period, value]) => ({ source: "pypi", series: name, period, value }));
}

type PackageProgress = { nextFrom: string | null; refreshedAt: string | null };
export const packagesJob: Job = async (ctx) => {
  const today = iso(new Date());
  const cutoff = dateBefore(today, 1); // omit unsettled current/yesterday counts
  const wheel = await readCollectorState(ctx.db, "packages:rotation", { nextIndex: 0 });
  const failed: string[] = [];
  let rows = 0, processed = 0, partial = false;
  for (let offset = 0; offset < PACKAGES.length; offset++) {
    if (timeLeft(ctx) < 12_000) { partial = true; break; }
    const index = (wheel.state.nextIndex + offset) % PACKAGES.length;
    const pkg = PACKAGES[index];
    const key = "package:" + pkg.registry + ":" + pkg.name;
    const snap = await readCollectorState<PackageProgress>(ctx.db, key, { nextFrom: pkg.registry === "npm" ? NPM_BACKFILL_FROM : null, refreshedAt: null });
    if (!snap.state.nextFrom && snap.state.refreshedAt === today) continue;
    try {
      let batch: SeriesRow[], nextFrom: string | null = null;
      if (pkg.registry === "npm") {
        const start = snap.state.nextFrom ?? dateBefore(cutoff, 14);
        const end = [dateBefore(start, -539), dateBefore(cutoff, 1)].sort()[0];
        const { status, body } = await fetchJson<{ downloads?: Array<{ day: string; downloads: number }> }>(
          PACKAGE_SOURCES.npm + start + ":" + end + "/" + pkg.name, {}, Math.min(20_000, timeLeft(ctx) - 2_000));
        if (status !== 200 || !Array.isArray(body?.downloads)) throw new Error("HTTP " + status);
        batch = npmRows(pkg.name, body.downloads, start, end);
        nextFrom = end < dateBefore(cutoff, 1) ? dateBefore(end, -1) : null;
      } else {
        const { status, body } = await fetchJson<{ data?: Array<{ category: string; date: string; downloads: number }> }>(
          PACKAGE_SOURCES.pypi + pkg.name + "/overall?mirrors=false", {}, Math.min(20_000, timeLeft(ctx) - 2_000));
        if (status !== 200 || !Array.isArray(body?.data)) throw new Error("HTTP " + status);
        batch = pypiRows(pkg.name, body.data, cutoff);
      }
      if (!(await commitSeries(ctx.db, key, snap, { nextFrom, refreshedAt: nextFrom ? null : today }, batch))) partial = true;
      else { rows += batch.length; processed++; }
      if (nextFrom) partial = true;
    } catch (err) {
      failed.push(pkg.name + ": " + (err instanceof Error ? err.message : "fetch failed"));
    }
    // Fairness is independent of success: one slow/broken package cannot starve later packages.
    const rotation = await readCollectorState(ctx.db, "packages:rotation", { nextIndex: 0 });
    await commitCollectorState(ctx.db, "packages:rotation", rotation, { nextIndex: (index + 1) % PACKAGES.length });
    if (pkg.registry === "pypi" && timeLeft(ctx) > 3_000) await sleep(2_500);
  }
  return { stats: { rows, processed, failed }, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
