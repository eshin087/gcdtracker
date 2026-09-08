import { getArchiveMonthly, getArchiveShareByDay, getArchiveSummary, getRobotsCensus, isComparableArchivePeriod } from "./stats-census";
import { getSeries } from "./stats-sources";
import { cacheSummary } from "./query-cache";
import { dayOf } from "./format";

export interface HomeReportsData {
  windowEnd: string;
  github: Array<{ period: string; agentPrs: number | null; share: number | null; partial: boolean; hours: number }>;
  githubWeek: { agentPrs: number; prsOpened: number; days: number };
  daily: Array<{ day: string; share: number | null; partial: boolean; hours: number; agentPrs: number; prsOpened: number }>;
  robots: Array<{ date: string; sites: number; gpt: number; claude: number }>;
  wikimedia: Array<{ month: string; human: number | null; spider: number | null; automated: number | null }>;
}
/** Restore the full observed history, including gaps and missing trailing months. */
export function completedMonths(observed: string[], today: string): string[] {
  const valid = observed.filter(m => /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(m) && m < today.slice(0,7)).sort();
  if (!valid.length) return [];
  const [year, month] = valid[0].split("-").map(Number);
  const [endYear, endMonth] = today.slice(0,7).split("-").map(Number);
  const count = (endYear-year)*12+endMonth-month;
  return Array.from({length:count}, (_,i) => new Date(Date.UTC(year,month-1+i,1)).toISOString().slice(0,7));
}
export async function queryHomeReports(): Promise<HomeReportsData> {
  const [monthly, archive, census, wm, daily] = await Promise.all([
    getArchiveMonthly(), getArchiveSummary(), getRobotsCensus(), getSeries("wm-pageviews"), getArchiveShareByDay(),
  ]);
  const today = dayOf();
  const human = new Map((wm["all-projects:user"] ?? []).map(p => [p.period.slice(0,7), p.value]));
  const spider = new Map((wm["all-projects:spider"] ?? []).map(p => [p.period.slice(0,7), p.value]));
  const automated = new Map((wm["all-projects:automated"] ?? []).map(p => [p.period.slice(0,7), p.value]));
  const months = completedMonths([...human.keys(), ...spider.keys(), ...automated.keys()], today);
  const archiveMonths = new Map(monthly.map(m => [m.period,m]));
  return {
    windowEnd: today,
    github: completedMonths(monthly.map(m => m.period),today).map(period => {
      const m = archiveMonths.get(period);
      return {period,agentPrs:m?.agentPrs ?? null,hours:m?.hours ?? 0,
        share:m && isComparableArchivePeriod(m,today) && m.prsOpened > 0 ? 100*m.agentPrs/m.prsOpened : null,
        partial:!m || !isComparableArchivePeriod(m,today)};
    }),
    githubWeek: archive.last7,
    daily: daily.filter(d => d.day < today).map(d => ({
      day:d.day,share:d.share,partial:d.partial,hours:d.hours,agentPrs:d.agentPrs,prsOpened:d.prsOpened,
    })),
    robots: census.map(c => ({date:c.date,sites:c.sites,
      gpt:100*(c.tokens.GPTBot?.blocked ?? 0)/c.sites,claude:100*(c.tokens.ClaudeBot?.blocked ?? 0)/c.sites})),
    wikimedia: months.map(month => ({month,human:human.get(month) ?? null,spider:spider.get(month) ?? null,automated:automated.get(month) ?? null})),
  };
}
export const getHomeReports = cacheSummary(queryHomeReports, "internet-multi-year-v2");
