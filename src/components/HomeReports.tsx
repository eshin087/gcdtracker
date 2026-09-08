import { FigureHead, StatTiles } from "./ui";
import { CensusHistory, ActivityHeatmap } from "./HomeCensus";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { HomeReportsData } from "@/lib/home-reports";

export function HomeReportHeadlines({ data }: { data: HomeReportsData }) {
  const crawl = data.robots.at(-1);
  return <StatTiles tiles={[
    {value:data.githubWeek.days ? fmtInt(data.githubWeek.agentPrs) : "–",label:"Agent-attributed public PRs, 7-day window",sub:`${data.githubWeek.days}/7 comparable UTC days · GH Archive`},
    {value:data.githubWeek.prsOpened > 0 ? fmtPct(data.githubWeek.agentPrs/data.githubWeek.prsOpened) : "–",label:"Agent share of observed public PRs",sub:"Same comparable days and detector cohort"},
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
      <FigureHead id="heatmap-title" title="Agent activity, day by day" sub="A calendar of agent-attributed pull requests in the public GitHub event feed." more={{href:"/github",label:"Full GitHub census →"}}/>
      <ActivityHeatmap days={data.daily} windowEnd={data.windowEnd}/>
    </section>
  </>;
}
