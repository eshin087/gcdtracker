import { FigureHead, StatTiles } from "./ui";
import { CensusHistory, ActivityHeatmap } from "./HomeCensus";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { HomeReportsData } from "@/lib/home-reports";

export function HomeReportHeadlines({ data }: { data: HomeReportsData }) {
  const crawl = data.robots.at(-1);
  const week = data.searchWeek;
  return <StatTiles tiles={[
    {value:week.days ? fmtInt(week.agentPrs) : "–",label:"Agent-attributed public PRs, 7-day window",sub:week.days ? `${week.days}/7 comparable UTC days · GitHub search v1` : "GitHub search v1 · collecting comparable days"},
    {value:week.prsOpened > 0 ? fmtPct(week.agentPrs/week.prsOpened) : "–",label:"Agent share of public PRs opened",sub:"Same days · deduplicated detector union"},
    {value:crawl ? fmtInt(crawl.sites) : "–",label:"Hosts in the latest policy sample",sub:crawl ? "Common Crawl · "+fmtDate(crawl.date) : "Corrected v2 sample unavailable"},
  ]}/>;
}

export function HomeReports({ data }: { data: HomeReportsData }) {
  return <>
    <section id="census" className="overview-report" aria-labelledby="census-title">
      <FigureHead id="census-title" title="The census" sub="Multi-year measurements of reading, coding and crawler policies across public sources." more={{href:"/before-after",label:"Explore the long view →"}}/>
      <CensusHistory wikimedia={data.wikimedia} github={data.github} robots={data.robots}/>
    </section>
    <section id="activity-heatmap" className="overview-report" aria-labelledby="heatmap-title">
      <FigureHead id="heatmap-title" title="Agent activity, day by day" sub="A calendar of the agent-attributed share of public GitHub pull requests, by detector version." more={{href:"/github",label:"Full GitHub census →"}}/>
      <ActivityHeatmap archive={data.daily} search={data.searchDaily} windowEnd={data.windowEnd}/>
    </section>
  </>;
}
