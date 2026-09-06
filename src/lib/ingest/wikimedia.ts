import { sql } from "drizzle-orm";
import { commonsAiUploads, wikidataBotEdits, wikiDaily, wikiTagWatch } from "@/lib/db/schema";
import { compactDay, daysAgo } from "@/lib/format";
import { fetchJson, type Job, timeLeft } from "./common";

const METRICS = "https://wikimedia.org/api/rest_v1/metrics/edits/aggregate";

/** Projects whose daily bot and total edit counts we keep (metrics API project names → short keys). */
export const WIKI_PROJECTS: Array<{ key: string; project: string; label: string }> = [
  { key: "wikidata", project: "www.wikidata.org", label: "Wikidata" },
  { key: "de", project: "de.wikipedia", label: "German Wikipedia" },
  { key: "fr", project: "fr.wikipedia", label: "French Wikipedia" },
  { key: "es", project: "es.wikipedia", label: "Spanish Wikipedia" },
  { key: "ja", project: "ja.wikipedia", label: "Japanese Wikipedia" },
  { key: "it", project: "it.wikipedia", label: "Italian Wikipedia" },
  { key: "ru", project: "ru.wikipedia", label: "Russian Wikipedia" },
  { key: "zh", project: "zh.wikipedia", label: "Chinese Wikipedia" },
  { key: "pt", project: "pt.wikipedia", label: "Portuguese Wikipedia" },
  { key: "ar", project: "ar.wikipedia", label: "Arabic Wikipedia" },
  { key: "commons", project: "commons.wikimedia", label: "Wikimedia Commons" },
];

/** Wikidata bots that are LLM-driven or agent-like rather than classic rule-based scripts. */
export const WIKIDATA_BOTS = ["SpinachBot"];

const TAG_SWEEP_WIKIS = ["en", "de", "fr", "es", "ja", "it", "ru", "zh", "pt", "ar", "nl", "pl", "sv", "uk", "vi", "id", "ko", "tr", "fa", "he"];

async function metrics(project: string, editor: string, start: string, end: string): Promise<Map<string, number>> {
  const { status, body } = await fetchJson<{ items?: Array<{ results?: Array<{ timestamp: string; edits: number }> }> }>(`${METRICS}/${project}/${editor}/all-page-types/daily/${start}/${end}`);
  const map = new Map<string, number>();
  if (status === 200) for (const r of body?.items?.[0]?.results ?? []) map.set(r.timestamp.slice(0, 10), r.edits);
  return map;
}

export const wikimediaJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { projects: 0, botEdits: 0, commons: 0 };
  let partial = false;
  const start = compactDay(daysAgo(12));
  const end = compactDay(daysAgo(2));

  // 1. Daily totals + bot edits per project (lags ~2 days).
  for (const p of WIKI_PROJECTS) {
    if (timeLeft(ctx) < 20_000) {
      partial = true;
      break;
    }
    const [all, bot] = await Promise.all([metrics(p.project, "all-editor-types", start, end), metrics(p.project, "group-bot", start, end)]);
    for (const [day, total] of all) {
      await ctx.db
        .insert(wikiDaily)
        .values({ day, wiki: p.key, total, bot: bot.get(day) ?? null, anon: null })
        .onConflictDoUpdate({ target: [wikiDaily.day, wikiDaily.wiki], set: { total: sql`excluded.total`, bot: sql`coalesce(excluded.bot, ${wikiDaily.bot})` } });
    }
    stats.projects = (stats.projects as number) + 1;
  }

  // 2. Live contributions of agent-like Wikidata bots.
  for (const user of WIKIDATA_BOTS) {
    if (timeLeft(ctx) < 15_000) {
      partial = true;
      break;
    }
    const qs = new URLSearchParams({ action: "query", list: "usercontribs", ucuser: user, uclimit: "500", ucprop: "ids|title|timestamp|comment|size", format: "json", formatversion: "2" });
    const { status, body } = await fetchJson<{ query?: { usercontribs?: Array<{ userid: number; user: string; revid: number; title: string; timestamp: string; comment?: string; size?: number }> } }>(
      `https://www.wikidata.org/w/api.php?${qs}`,
    );
    const items = status === 200 ? (body?.query?.usercontribs ?? []) : [];
    if (items.length > 0) {
      await ctx.db
        .insert(wikidataBotEdits)
        .values(items.map((c) => ({ revid: c.revid, user: c.user, userId: c.userid, title: c.title.slice(0, 300), ts: new Date(c.timestamp), comment: (c.comment ?? "").slice(0, 300) || null, size: c.size ?? null })))
        .onConflictDoNothing();
      stats.botEdits = (stats.botEdits as number) + items.length;
    }
  }

  // 3. Commons: newest uploads in AI-generated categories.
  for (const category of ["AI-generated images", "AI-generated videos"]) {
    if (timeLeft(ctx) < 15_000) {
      partial = true;
      break;
    }
    const qs = new URLSearchParams({ action: "query", list: "categorymembers", cmtitle: `Category:${category}`, cmsort: "timestamp", cmdir: "desc", cmlimit: "200", cmprop: "title|timestamp|ids", format: "json", formatversion: "2" });
    const { status, body } = await fetchJson<{ query?: { categorymembers?: Array<{ pageid: number; title: string; timestamp: string }> } }>(`https://commons.wikimedia.org/w/api.php?${qs}`);
    const items = status === 200 ? (body?.query?.categorymembers ?? []) : [];
    if (items.length > 0) {
      await ctx.db
        .insert(commonsAiUploads)
        .values(items.map((m) => ({ pageid: m.pageid, title: m.title.slice(0, 300), ts: new Date(m.timestamp), category })))
        .onConflictDoNothing();
      stats.commons = (stats.commons as number) + items.length;
    }
  }

  // 4. Monthly tag sweep: which wikis have AI-related change tags (early warning for new filters).
  const dayOfMonth = new Date().getUTCDate();
  const hourOfDay = new Date().getUTCHours();
  if (dayOfMonth === 1 && hourOfDay < 2 && timeLeft(ctx) > 60_000) {
    let found = 0;
    for (const wiki of TAG_SWEEP_WIKIS) {
      if (timeLeft(ctx) < 15_000) break;
      const qs = new URLSearchParams({ action: "query", list: "tags", tglimit: "500", tgprop: "name|displayname|hitcount|active", format: "json", formatversion: "2" });
      const { status, body } = await fetchJson<{ query?: { tags?: Array<{ name: string; hitcount?: number; active?: boolean }> } }>(`https://${wiki}.wikipedia.org/w/api.php?${qs}`);
      if (status !== 200) continue;
      const ai = (body?.query?.tags ?? []).filter((t) => /\b(ai|llm|gpt|chatgpt|machine[- ]generated)\b/i.test(t.name));
      for (const t of ai) {
        await ctx.db
          .insert(wikiTagWatch)
          .values({ wiki, tag: t.name, hitcount: t.hitcount ?? 0, active: t.active ?? true })
          .onConflictDoUpdate({ target: [wikiTagWatch.wiki, wikiTagWatch.tag], set: { hitcount: sql`excluded.hitcount`, active: sql`excluded.active`, lastSeen: new Date() } });
        found++;
      }
    }
    stats.tagSweep = found;
  }
  return { stats, partial };
};
