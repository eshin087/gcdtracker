import { sql } from "drizzle-orm";
import { wikiDaily, wikiEdits } from "@/lib/db/schema";
import { compactDay, daysAgo } from "@/lib/format";
import { fetchJson, type Job, lastCursor, timeLeft } from "./common";

const WIKI = "en";
const API = "https://en.wikipedia.org/w/api.php";
const METRICS = "https://wikimedia.org/api/rest_v1/metrics/edits/aggregate/en.wikipedia";
const RCPROP = "title|ids|sizes|flags|user|timestamp|comment|tags";

/** First-party change tags that mark suspected AI involvement (verified 2026-09-06). */
export const AI_TAGS = ["possible AI-generated citations", "AI-generated source", "app-ai-assist"];

export interface RecentChange {
  type: string;
  ns: number;
  title: string;
  pageid?: number;
  revid?: number;
  old_revid?: number;
  rcid: number;
  user: string;
  bot?: boolean;
  new?: boolean;
  minor?: boolean;
  oldlen?: number;
  newlen?: number;
  timestamp: string;
  comment?: string;
  tags?: string[];
}

interface RcResponse {
  continue?: { rccontinue?: string };
  query?: { recentchanges?: RecentChange[] };
  error?: { code: string; info: string };
}

/** Summaries that say an AI tool was involved in the edit itself. */
const SUMMARY_RE =
  /\b(chatgpt|gpt-?[45o]|claude|gemini|copilot|llm|large language model|ai[- ]generated|ai[- ]assisted|generated (?:with|by|using) (?:an? )?ai|written (?:with|by|using) (?:an? )?ai|with the help of (?:an? )?ai|ai (?:tool|assistant|agent))\b/i;
/** Usernames that announce automation without a bot flag. */
const USER_RE = /(^|[^a-z])(gpt|claude|llm|openai|agent|assistant|autobot|aibot|ai-?bot|bot\d)([^a-z]|$)/i;
/** CamelCase "Agent"/"Bot" as in ResearchAgent42 or MassUpdaterBot (case-sensitive; skips "Magenta", "Reagent"). */
const USER_CAMEL_RE = /[a-z](Agent|Bot|GPT|LLM)(?![a-z])/;

export interface Score {
  tier: 1 | 2;
  signals: string[];
}

export function scoreEdit(rc: RecentChange): Score | null {
  const signals: string[] = [];
  for (const t of rc.tags ?? []) if (AI_TAGS.includes(t)) signals.push(`tag:${t}`);
  if (signals.length > 0) return { tier: 1, signals };

  const comment = rc.comment ?? "";
  const m = comment.match(SUMMARY_RE);
  if (m && !rc.title.toLowerCase().includes(m[1].toLowerCase()) && !rc.bot) signals.push(`summary:${m[1].toLowerCase()}`);
  if (!rc.bot && (USER_RE.test(rc.user) || USER_CAMEL_RE.test(rc.user))) signals.push("user:agent-like");
  return signals.length > 0 ? { tier: 2, signals } : null;
}

export function diffUrl(rc: RecentChange): string {
  return rc.revid ? `https://en.wikipedia.org/w/index.php?diff=prev&oldid=${rc.revid}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(rc.title)}`;
}

async function rcFetch(params: Record<string, string>): Promise<RcResponse> {
  const qs = new URLSearchParams({ action: "query", list: "recentchanges", format: "json", formatversion: "2", rcprop: RCPROP, rclimit: "500", ...params });
  const { status, body } = await fetchJson<RcResponse>(`${API}?${qs}`);
  if (status !== 200 || !body) throw new Error(`recentchanges ${status}`);
  if (body.error) throw new Error(`recentchanges ${body.error.code}: ${body.error.info}`);
  return body;
}

async function upsertEdits(ctx: Parameters<Job>[0], rows: Array<{ rc: RecentChange; score: Score }>): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map(({ rc, score }) => ({
    wiki: WIKI,
    rcid: rc.rcid,
    revId: rc.revid ?? null,
    ts: new Date(rc.timestamp),
    title: rc.title.slice(0, 300),
    user: rc.user.slice(0, 200),
    comment: (rc.comment ?? "").slice(0, 500) || null,
    tags: rc.tags ?? [],
    tier: score.tier,
    signals: score.signals,
    oldLen: rc.oldlen ?? null,
    newLen: rc.newlen ?? null,
    url: diffUrl(rc),
  }));
  // one INSERT per 200 rows keeps statements small over HTTP
  for (let i = 0; i < values.length; i += 200) {
    await ctx.db
      .insert(wikiEdits)
      .values(values.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [wikiEdits.wiki, wikiEdits.rcid],
        set: {
          tier: sql`least(${wikiEdits.tier}, excluded.tier)`,
          tags: sql`excluded.tags`,
          signals: sql`case when excluded.tier < ${wikiEdits.tier} then excluded.signals else ${wikiEdits.signals} end`,
        },
      });
  }
  return values.length;
}

export const wikipediaJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { tier1: 0, tier2: 0, pages: 0 };
  let partial = false;

  // Tier 1: first-party tags, last 48 hours, a few pages per tag.
  const rcend = new Date(Date.now() - 48 * 3_600_000).toISOString();
  for (const tag of AI_TAGS) {
    let cont: string | undefined;
    for (let page = 0; page < 3; page++) {
      if (timeLeft(ctx) < 10_000) {
        partial = true;
        break;
      }
      const body = await rcFetch({ rctag: tag, rcend, ...(cont ? { rccontinue: cont } : {}) });
      const items = body.query?.recentchanges ?? [];
      const scored = items.map((rc) => ({ rc, score: { tier: 1 as const, signals: [`tag:${tag}`] } }));
      stats.tier1 = (stats.tier1 as number) + (await upsertEdits(ctx, scored));
      stats.pages = (stats.pages as number) + 1;
      cont = body.continue?.rccontinue;
      if (!cont) break;
    }
  }

  // Tier 2: heuristic scan of non-bot edits since the cursor.
  let cursor = await lastCursor(ctx.db, "wikipedia");
  const minCursor = new Date(Date.now() - 30 * 86_400_000);
  if (!cursor || new Date(cursor) < minCursor) cursor = new Date(Date.now() - 6 * 3_600_000).toISOString();
  let cont: string | undefined;
  let newest = cursor;
  for (let page = 0; page < 12; page++) {
    if (timeLeft(ctx) < 10_000) {
      partial = true;
      break;
    }
    const body = await rcFetch({ rcdir: "newer", rcstart: cursor, rcshow: "!bot", rctype: "edit|new", ...(cont ? { rccontinue: cont } : {}) });
    const items = body.query?.recentchanges ?? [];
    const scored: Array<{ rc: RecentChange; score: Score }> = [];
    for (const rc of items) {
      const s = scoreEdit(rc);
      if (s) scored.push({ rc, score: s });
    }
    stats.tier2 = (stats.tier2 as number) + (await upsertEdits(ctx, scored));
    stats.pages = (stats.pages as number) + 1;
    const last = items[items.length - 1];
    if (last && last.timestamp > newest) newest = last.timestamp;
    cont = body.continue?.rccontinue;
    if (!cont) break;
  }
  stats.scannedUntil = newest;

  // Daily totals from the metrics API (lags a few days; 404 means not yet available).
  if (timeLeft(ctx) > 15_000) {
    const start = compactDay(daysAgo(12));
    const end = compactDay(daysAgo(2));
    const series: Record<string, Map<string, number>> = {};
    for (const editor of ["all-editor-types", "group-bot", "anonymous"]) {
      const { status, body } = await fetchJson<{ items?: Array<{ results?: Array<{ timestamp: string; edits: number }> }> }>(
        `${METRICS}/${editor}/all-page-types/daily/${start}/${end}`,
      );
      const map = new Map<string, number>();
      if (status === 200) for (const r of body?.items?.[0]?.results ?? []) map.set(r.timestamp.slice(0, 10), r.edits);
      series[editor] = map;
    }
    const days = [...series["all-editor-types"].keys()];
    for (const day of days) {
      await ctx.db
        .insert(wikiDaily)
        .values({ day, wiki: WIKI, total: series["all-editor-types"].get(day) ?? null, bot: series["group-bot"].get(day) ?? null, anon: series["anonymous"].get(day) ?? null })
        .onConflictDoUpdate({ target: [wikiDaily.day, wikiDaily.wiki], set: { total: sql`excluded.total`, bot: sql`excluded.bot`, anon: sql`excluded.anon` } });
    }
    stats.metricsDays = days.length;
  }

  return { stats, cursor: newest, partial };
};
