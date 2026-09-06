import { and, eq, gte, sql } from "drizzle-orm";
import { githubDaily, githubEvents } from "@/lib/db/schema";
import { dayOf, dayRange, daysAgo } from "@/lib/format";
import { GITHUB_AGENTS, type GithubAgent } from "@/lib/github/agents";
import { fetchJson, type Job, type JobContext, sleep, timeLeft } from "./common";

const SEARCH = "https://api.github.com/search/issues";

interface SearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  created_at: string;
}
interface SearchResponse {
  total_count?: number;
  incomplete_results?: boolean;
  items?: SearchItem[];
  message?: string;
}

/** Search API pacing: 10/min unauthenticated, 30/min with a token. */
function gapMs(): number {
  return process.env.GITHUB_TOKEN ? 2_100 : 6_500;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export class RateLimited extends Error {
  constructor(public readonly resetAt: number) {
    super("github rate limited");
  }
}

let lastCall = 0;

/** One paced search call. Throws RateLimited with the reset time on 403/429. */
async function search(q: string, extra: Record<string, string> = {}): Promise<SearchResponse> {
  const wait = lastCall + gapMs() - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const qs = new URLSearchParams({ q, per_page: "1", ...extra });
  const { status, body, headers: h } = await fetchJson<SearchResponse>(`${SEARCH}?${qs}`, { headers: headers() });
  if (status === 403 || status === 429) {
    const reset = Number(h.get("x-ratelimit-reset") ?? 0) * 1000;
    throw new RateLimited(reset || Date.now() + 60_000);
  }
  if (status !== 200 || !body) throw new Error(`github search ${status} ${body?.message ?? ""}`.trim());
  return body;
}

async function countDay(ctx: JobContext, agent: GithubAgent, day: string, final: boolean): Promise<number> {
  const body = await search(`is:pr ${agent.query} created:${day}`);
  const prs = body.total_count ?? 0;
  await ctx.db
    .insert(githubDaily)
    .values({ day, agent: agent.key, prs, tier: agent.tier, final, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [githubDaily.day, githubDaily.agent], set: { prs, final, fetchedAt: new Date() } });
  return prs;
}

/** Budget-aware: returns false when the deadline is too close for another paced call. */
function canCall(ctx: JobContext): boolean {
  return timeLeft(ctx) > gapMs() + 12_000;
}

export const githubJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { queries: 0, backfilled: 0 };
  let partial = false;
  const today = dayOf();
  const yesterday = daysAgo(1);

  const rows = await ctx.db
    .select({ day: githubDaily.day, agent: githubDaily.agent, final: githubDaily.final })
    .from(githubDaily)
    .where(gte(githubDaily.day, daysAgo(30)));
  const have = new Map(rows.map((r) => [`${r.day}|${r.agent}`, r.final]));

  const work: Array<{ agent: GithubAgent; day: string; final: boolean }> = [];
  for (const a of GITHUB_AGENTS) if (!have.get(`${yesterday}|${a.key}`)) work.push({ agent: a, day: yesterday, final: true });
  for (const a of GITHUB_AGENTS) work.push({ agent: a, day: today, final: false });
  // gradual 30-day backfill, oldest missing first
  for (const day of dayRange(daysAgo(30), daysAgo(2))) {
    for (const a of GITHUB_AGENTS) if (!have.has(`${day}|${a.key}`)) work.push({ agent: a, day, final: true });
  }

  try {
    for (const w of work) {
      if (!canCall(ctx)) {
        partial = true;
        break;
      }
      await countDay(ctx, w.agent, w.day, w.final);
      stats.queries = (stats.queries as number) + 1;
      if (w.day !== today && w.day !== yesterday) stats.backfilled = (stats.backfilled as number) + 1;
    }

    // Sample feed: one agent per run, rotating every 30 minutes.
    if (canCall(ctx)) {
      const idx = Math.floor(Date.now() / 1_800_000) % GITHUB_AGENTS.length;
      const agent = GITHUB_AGENTS[idx];
      const body = await search(`is:pr ${agent.query}`, { sort: "created", order: "desc", per_page: "20" });
      stats.queries = (stats.queries as number) + 1;
      const items = (body.items ?? []).filter((i) => i.id && i.html_url);
      if (items.length > 0) {
        await ctx.db
          .insert(githubEvents)
          .values(
            items.map((i) => ({
              id: i.id,
              agent: agent.key,
              repo: i.repository_url.replace("https://api.github.com/repos/", "").slice(0, 200),
              number: i.number,
              title: i.title.slice(0, 300),
              url: i.html_url,
              createdAt: new Date(i.created_at),
            })),
          )
          .onConflictDoNothing();
      }
      stats.sample = `${agent.key}:${items.length}`;
    } else {
      partial = true;
    }
  } catch (err) {
    if (err instanceof RateLimited) {
      stats.rateLimitedUntil = new Date(err.resetAt).toISOString();
      partial = true;
    } else {
      throw err;
    }
  }

  const [t] = await ctx.db
    .select({ prs: sql<number>`coalesce(sum(${githubDaily.prs}), 0)` })
    .from(githubDaily)
    .where(and(eq(githubDaily.day, yesterday), eq(githubDaily.tier, "bot-account")));
  stats.yesterdayBotPrs = Number(t?.prs ?? 0);
  return { stats, partial };
};
