import { FigureHead, StatTiles } from "./ui";
import { CensusHistory, ActivityHeatmap } from "./HomeCensus";
import { fmtDate, fmtInt } from "@/lib/format";
import type { HomeReportsData } from "@/lib/home-reports";

export function HomeReportHeadlines({ data }: { data: HomeReportsData }) {
  const crawl = data.robots.at(-1);
  const since = new Date(Date.parse(data.windowEnd+"T00:00:00Z")-7*86_400_000).toISOString().slice(0,10);
  const observed = data.daily.filter(d => d.day >= since && d.day < data.windowEnd);
  const agentPrs = observed.reduce((sum,d) => sum+d.agentPrs,0);
  const prs = observed.reduce((sum,d) => sum+d.prsOpened,0);
  const coverage = `${observed.length}/7 UTC days observed - ${data.githubWeek.days}/7 comparable - includes legacy/partial counts`;
  return <StatTiles tiles={[
    {value:observed.length ? fmtInt(agentPrs) : "Unavailable",label:"Recorded agent-attributed PRs, 7-day window",sub:coverage},
    {value:observed.length ? fmtInt(prs) : "Unavailable",label:"Total observed public PRs, 7-day window",sub:"GH Archive - recorded counts, not a complete GitHub total"},
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
