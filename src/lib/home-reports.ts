import { getArchiveMonthly, getArchiveSummary, getRobotsCensus, isComparableArchivePeriod } from "./stats-census";
import { getRadarSnapshot, getSeries } from "./stats-sources";
import { cacheSummary } from "./query-cache";
import { dayOf } from "./format";
import type { RadarMetadata } from "./ingest/radar";

export interface HomeReportsData {
  github: Array<{ period: string; agentPrs: number; share: number | null; partial: boolean; hours: number }>;
  githubWeek: { agentPrs: number; prsOpened: number; days: number };
  robots: Array<{ date: string; sites: number; gpt: number; claude: number }>;
  wikimedia: Array<{ month: string; spider: number | null; automated: number | null }>;
  radar: { bots: Array<{ name: string; value: number }>; meta: RadarMetadata | null };
}
/** Keep calendar gaps and stale trailing months visible, bounded to two years. */
export function completedMonths(observed: string[], today: string): string[] {
  const valid = observed.filter(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m < today.slice(0,7)).sort();
  if (!valid.length) return [];
  const [year, month] = today.slice(0,7).split("-").map(Number);
  return Array.from({length:24}, (_,i) => new Date(Date.UTC(year,month-25+i,1)).toISOString().slice(0,7))
    .filter(m => m >= valid[0]);
}
export async function queryHomeReports(): Promise<HomeReportsData> {
  const [monthly, archive, census, wm, radar] = await Promise.all([
    getArchiveMonthly(), getArchiveSummary(), getRobotsCensus(), getSeries("wm-pageviews"), getRadarSnapshot(),
  ]);
  const today = dayOf();
  const spider = new Map((wm["all-projects:spider"] ?? []).map(p => [p.period.slice(0,7), p.value]));
  const automated = new Map((wm["all-projects:automated"] ?? []).map(p => [p.period.slice(0,7), p.value]));
  const months = completedMonths([...spider.keys(), ...automated.keys()], today);
  const meta = radar.metadata["bot-share"] ?? null;
  return {
    github: monthly.slice(-24).map(m => ({period:m.period, agentPrs:m.agentPrs, hours:m.hours,
      share:isComparableArchivePeriod(m,today) && m.prsOpened > 0 ? 100*m.agentPrs/m.prsOpened : null,
      partial:!isComparableArchivePeriod(m,today)})),
    githubWeek: archive.last7,
    robots: census.slice(-18).map(c => ({date:c.date,sites:c.sites,
      gpt:100*(c.tokens.GPTBot?.blocked ?? 0)/c.sites,claude:100*(c.tokens.ClaudeBot?.blocked ?? 0)/c.sites})),
    wikimedia: months.map(month => ({month,spider:spider.get(month) ?? null,automated:automated.get(month) ?? null})),
    radar: {meta,bots:meta ? Object.entries(radar.series).filter(([key]) => key.startsWith("bot-share:"))
      .flatMap(([key,points]) => points.length ? [{name:key.slice(10),value:points.at(-1)!.value}] : [])
      .sort((a,b) => b.value-a.value).slice(0,6) : []},
  };
}
export const getHomeReports = cacheSummary(queryHomeReports, "internet-home-reports-v1");
