import { sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job, lastCursor, sleep, timeLeft } from "./common";

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

type Row = { source: string; series: string; period: string; value: number; lo: null; hi: null };

async function upsert(ctx: Parameters<Job>[0], rows: Row[]) {
  for (let i = 0; i < rows.length; i += 300) {
    await ctx.db
      .insert(externalSeries)
      .values(rows.slice(i, i + 300))
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
  }
}

/**
 * Daily download counts of agent CLIs and agent frameworks: a demand-side measure of
 * how many machines are being given an agent. First run backfills; later runs top up.
 */
export const packagesJob: Job = async (ctx) => {
  const done = await lastCursor(ctx.db, "packages");
  const backfill = !done;
  const stats: Record<string, unknown> = { backfill };
  const today = new Date();
  const npmFrom = backfill ? NPM_BACKFILL_FROM : iso(new Date(today.getTime() - 14 * 86_400_000));
  let rows = 0;
  const failed: string[] = [];

  for (const pkg of PACKAGES.filter((p) => p.registry === "npm")) {
    if (timeLeft(ctx) < 10_000) return { stats: { ...stats, rows, failed, partial: true }, partial: true };
    // Walk the range in 18-month windows.
    let start = new Date(`${npmFrom}T00:00:00Z`);
    while (start < today) {
      const end = new Date(Math.min(today.getTime(), start.getTime() + 540 * 86_400_000));
      const { status, body } = await fetchJson<{ downloads?: Array<{ day: string; downloads: number }> }>(`${PACKAGE_SOURCES.npm}${iso(start)}:${iso(end)}/${pkg.name}`);
      if (status !== 200 || !body?.downloads) {
        failed.push(`${pkg.name} (${status})`);
        break;
      }
      // npm reports today and yesterday before their counts settle; keep complete days only.
      const cutoff = iso(new Date(today.getTime() - 86_400_000));
      const batch: Row[] = body.downloads.filter((d) => d.day < cutoff).map((d) => ({ source: "npm", series: pkg.name, period: d.day, value: d.downloads, lo: null, hi: null }));
      await upsert(ctx, batch);
      rows += batch.length;
      start = new Date(end.getTime() + 86_400_000);
    }
  }

  // pypistats serves the last 180 days and rate-limits hard, so pace the calls.
  for (const pkg of PACKAGES.filter((p) => p.registry === "pypi")) {
    if (timeLeft(ctx) < 10_000) return { stats: { ...stats, rows, failed, partial: true }, partial: true };
    const { status, body } = await fetchJson<{ data?: Array<{ category: string; date: string; downloads: number }> }>(`${PACKAGE_SOURCES.pypi}${pkg.name}/overall?mirrors=false`);
    if (status !== 200 || !body?.data) {
      failed.push(`${pkg.name} (${status})`);
      await sleep(3_000);
      continue;
    }
    const keep = backfill ? body.data : body.data.slice(-14);
    const batch: Row[] = keep.map((d) => ({ source: "pypi", series: pkg.name, period: d.date, value: d.downloads, lo: null, hi: null }));
    await upsert(ctx, batch);
    rows += batch.length;
    await sleep(2_500);
  }

  return { stats: { ...stats, rows, failed }, cursor: iso(today) };
};
