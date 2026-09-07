import Link from "next/link";
import { TimelineChart } from "./charts";
import { BarList, FigureHead, StatTiles } from "./ui";
import { radarUnit, radarValue } from "./radar-labels";
import { fmtDate, fmtInt, fmtPct, fmtStamp } from "@/lib/format";
import type { HomeReportsData } from "@/lib/home-reports";

const monthLabel = (day: string) => new Date(day+"T00:00:00Z").toLocaleDateString("en-US", {month:"short",year:"2-digit",timeZone:"UTC"});

export function HomeReportHeadlines({ data }: { data: HomeReportsData }) {
  const crawl = data.robots.at(-1);
  return <StatTiles tiles={[
    {value:data.githubWeek.days ? fmtInt(data.githubWeek.agentPrs) : "–",label:"Agent-attributed public PRs, 7-day window",sub:`${data.githubWeek.days}/7 comparable UTC days · GH Archive`},
    {value:data.githubWeek.prsOpened > 0 ? fmtPct(data.githubWeek.agentPrs/data.githubWeek.prsOpened) : "–",label:"Agent share of observed public PRs",sub:"Same comparable days and detector cohort"},
    {value:crawl ? fmtInt(crawl.sites) : "–",label:"Hosts in the latest policy sample",sub:crawl ? "Common Crawl · "+fmtDate(crawl.date) : "Corrected v2 sample unavailable"},
  ]}/>;
}

export function HomeReports({ data }: { data: HomeReportsData }) {
  const crawl = data.robots.at(-1), meta = data.radar.meta;
  return <>
    <section id="web-traffic" className="overview-report" aria-labelledby="web-traffic-title">
      <FigureHead id="web-traffic-title" title="How crawlers read the web" sub="Two external vantage points: bot traffic on Cloudflare and automated pageviews across Wikimedia." more={{href:"/traffic",label:"Full traffic report →"}}/>
      <div className="report-grid">
        <figure>
          <h3>Bot traffic on Cloudflare</h3>
          {meta && data.radar.bots.length ? <>
            <p className="label">{radarUnit(meta)} · source snapshot</p>
            <BarList rows={data.radar.bots.map(b => ({key:b.name,label:b.name,value:b.value}))} format={v => radarValue(v,meta)}/>
            <figcaption>{meta.dateRange.map(r => fmtStamp(r.startTime)+" – "+fmtStamp(r.endTime)).join("; ")}. Fetched {fmtStamp(meta.fetchedAt)}. {meta.normalization === "MIN_MAX" ? "A normalized index, not a request count." : "Values retain the publisher's units."}</figcaption>
          </> : <p className="empty">No comparable Radar snapshot is available. <a href="https://radar.cloudflare.com/ai-insights">Open Cloudflare AI Insights ↗</a></p>}
          <p className="report-source">Cloudflare&apos;s network view; not a total for the internet. Bot rankings can include conventional search crawlers.</p>
        </figure>
        <figure>
          <h3>Automated reading across Wikimedia</h3>
          {data.wikimedia.length ? <TimelineChart sharedScale
            days={data.wikimedia.map(p => p.month+"-01")} bars={data.wikimedia.map(p => p.spider)} barLabel="Spider pageviews / month"
            line={data.wikimedia.map(p => p.automated)} lineLabel="Automated pageviews / month"
            title="Wikimedia spider and automated pageviews by month" xLabel={monthLabel} height={220}/> : <p className="empty">No Wikimedia traffic observations are available yet.</p>}
          <figcaption>Completed months only. Wikimedia&apos;s spider and automated classifications include non-AI bots. Missing observations are gaps, not zero. <Link href="/before-after">Read the source context →</Link></figcaption>
        </figure>
      </div>
    </section>

    <section id="github-census" className="overview-report" aria-labelledby="github-census-title">
      <FigureHead id="github-census-title" title="Coding agents across public GitHub" sub="Recorded agent-attributed pull requests and their share of the comparable public event feed." more={{href:"/github",label:"Explore GitHub →"}}/>
      {data.github.length ? <figure className="home-chart">
        <TimelineChart days={data.github.map(p => p.period+"-01")} bars={data.github.map(p => p.agentPrs)} barLabel="Agent-attributed PRs / month"
          line={data.github.map(p => p.share)} lineLabel="Share of observed PRs (%)" muted={data.github.map(p => p.partial)}
          title="Agent-attributed public GitHub pull requests and comparable share by month" xLabel={monthLabel} height={250}/>
        <figcaption>GH Archive observations, not every private or public GitHub action. Pale bars have incomplete or unvalidated coverage; their shares are withheld. Bot accounts and branch heuristics do not identify an underlying model. <Link href="/methods#github">Method and coverage →</Link></figcaption>
      </figure> : <p className="empty">No public archive observations are available yet.</p>}
    </section>

    <section id="crawler-policies" className="overview-report" aria-labelledby="crawler-policies-title">
      <FigureHead id="crawler-policies-title" title="Where sites explicitly block AI crawlers" sub="Named-token full-block directives in readable robots.txt files sampled from Common Crawl." more={{href:"/traffic",label:"Explore crawler policies →"}}/>
      {data.robots.length ? <figure className="home-chart">
        <TimelineChart sharedScale days={data.robots.map(p => p.date)} bars={data.robots.map(p => p.gpt)} barLabel="GPTBot full-block directives (%)"
          line={data.robots.map(p => p.claude)} lineLabel="ClaudeBot full-block directives (%)" title="Explicit named-token blocking in sampled hosts" xLabel={monthLabel} height={230}/>
        <figcaption>Latest sample: {fmtInt(crawl!.sites)} hosts, {fmtDate(crawl!.date)}. Definition v2; legacy definitions are not spliced into this line. These are policy directives, not observations of crawler compliance or representative whole-web blocking rates.</figcaption>
      </figure> : <p className="empty">No corrected v2 policy sample is available. Legacy observations remain stored separately.</p>}
    </section>
  </>;
}
