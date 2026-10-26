import { eq, sql } from "drizzle-orm";
import { wikiDaily, wikiEdits } from "@/lib/db/schema";
import { dayOf } from "@/lib/format";
import { fetchJson, type Job, timeLeft } from "./common";
import { fetchEditMetrics, lagDays, METRICS_LAG_PARTIAL_DAYS, metricsWindow, resolveLoadedWindow } from "./wikimedia-metrics";

const WIKI = "en";
const API = "https://en.wikipedia.org/w/api.php";
const PROJECT = "en.wikipedia";
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
  if (!Array.isArray(body.query?.recentchanges)) throw new Error("recentchanges missing result list");
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

/** Heuristic scanning cannot keep pace with every non-bot edit; it samples fixed slices spread across the previous day. */
export const TIER2_SLICES = 12;
export const TIER2_WINDOW_MS = 24 * 3_600_000;

/** Slice start times, oldest first, evenly spaced through the window ending at `now`. */
export function tier2Slices(now: Date, slices = TIER2_SLICES, windowMs = TIER2_WINDOW_MS): string[] {
  const start = now.getTime() - windowMs;
  const width = windowMs / slices;
  return Array.from({ length: slices }, (_, i) => new Date(start + i * width).toISOString());
}

export const wikipediaJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { tier1: 0, tier2: 0, pages: 0 };
  let partial = false;
  const failed: string[] = [];

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
    if (cont) partial = true;
  }

  // Tier 2: one page of non-bot edits from each slice of the previous 24 hours. This is a
  // time-spread sample with explicit coverage, not a continuous scan of every edit.
  const now = new Date();
  const slices = tier2Slices(now);
  let scanned = 0, coveredMs = 0, slicesDone = 0;
  for (const slice of slices) {
    if (timeLeft(ctx) < 10_000) {
      partial = true;
      break;
    }
    const body = await rcFetch({ rcdir: "newer", rcstart: slice, rcshow: "!bot", rctype: "edit|new" });
    const items = body.query?.recentchanges ?? [];
    const scored: Array<{ rc: RecentChange; score: Score }> = [];
    for (const rc of items) {
      const s = scoreEdit(rc);
      if (s) scored.push({ rc, score: s });
    }
    stats.tier2 = (stats.tier2 as number) + (await upsertEdits(ctx, scored));
    stats.pages = (stats.pages as number) + 1;
    scanned += items.length;
    slicesDone++;
    const first = items[0]?.timestamp, last = items[items.length - 1]?.timestamp;
    if (first && last) coveredMs += Math.max(0, Date.parse(last) - Date.parse(first));
  }
  stats.tier2Slices = `${slicesDone}/${slices.length}`;
  stats.tier2Scanned = scanned;
  stats.tier2Window = { from: new Date(now.getTime() - TIER2_WINDOW_MS).toISOString(), to: now.toISOString() };
  stats.tier2CoveredMinutes = Math.round(coveredMs / 60_000);

  // Daily totals come from a monthly-published dataset; a 404 means not loaded yet, not failure.
  if (timeLeft(ctx) > 15_000) {
    const today = dayOf();
    const [stored] = await ctx.db.select({ day: sql<string | null>`max(${wikiDaily.day})` }).from(wikiDaily).where(eq(wikiDaily.wiki, WIKI));
    const loadedThrough = stored?.day ? String(stored.day).slice(0, 10) : null;
    const window = metricsWindow(loadedThrough, today);
    stats.metricsLoadedThrough = loadedThrough;
    let updated = 0;
    if (!window) {
      stats.metricsUpToDate = true;
    } else {
      try {
        const resolved = await resolveLoadedWindow(PROJECT, "all-editor-types", window);
        if (!resolved) {
          const lag = lagDays(loadedThrough, today);
          stats.metricsUpstreamLag = true;
          stats.metricsLagDays = lag;
          if (lag === null || lag > METRICS_LAG_PARTIAL_DAYS) partial = true;
        } else {
          const series: Record<string, Map<string, number>> = { "all-editor-types": resolved.first };
          for (const editor of ["group-bot", "anonymous"]) {
            const result = await fetchEditMetrics(PROJECT, editor, window.start, resolved.end);
            if (result === "not-loaded") { partial = true; continue; }
            series[editor] = result;
          }
          const editors = ["all-editor-types", "group-bot", "anonymous"];
          if (editors.every((editor) => series[editor])) {
            const days = new Set(editors.flatMap((editor) => [...series[editor].keys()]));
            if (!days.size) partial = true;
            for (const day of [...days].sort()) {
              if (editors.some((editor) => !series[editor].has(day))) { partial = true; continue; }
              await ctx.db.insert(wikiDaily).values({
                day, wiki: WIKI, total: series["all-editor-types"].get(day)!, bot: series["group-bot"].get(day)!, anon: series["anonymous"].get(day)!,
              }).onConflictDoUpdate({ target: [wikiDaily.day, wikiDaily.wiki], set: { total: sql`excluded.total`, bot: sql`excluded.bot`, anon: sql`excluded.anon` } });
              updated++;
            }
          }
          stats.metricsLoadedEnd = resolved.end;
        }
      } catch (error) {
        failed.push("metrics");
        stats.metrics = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      }
    }
    stats.metricsDays = updated;
  } else {
    partial = true;
  }
  stats.failed = failed;
  return { stats, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
