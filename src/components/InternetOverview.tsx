import Link from "next/link";
import { ReadingReport, type ReadingSnapshot } from "./ReadingReport";
import { SocialReport } from "./SocialReport";
import type { SocialReportData } from "@/lib/social-report";
import { AgentFlow } from "./AgentFlow";
import { HomeReportHeadlines, HomeReports } from "./HomeReports";
import { FigureHead } from "./ui";
import { Rail, type RailItem } from "./Rail";
import { SaveButton } from "./SaveButton";
import { fmtStamp } from "@/lib/format";
import type { FlowData } from "@/lib/flow";
import type { LatestRecord } from "@/lib/stats-sources";
import type { HomeReportsData } from "@/lib/home-reports";

const SECTIONS: RailItem[] = [
  {id:"overview",title:"Overview"},{id:"flow",title:"Agents → destinations"},
  {id:"census",title:"The census"},{id:"activity-heatmap",title:"Daily heatmap"},{id:"ai-reading",title:"AI reading"},{id:"ai-publishing",title:"Social publishing"},{id:"latest",title:"Latest records"},
];
export function InternetOverview({ flow, records, reports, reading, social, demo = false }: { flow:FlowData; records:LatestRecord[]; reports:HomeReportsData; reading:ReadingSnapshot; social:SocialReportData; demo?:boolean }) {
  return <div className="shell with-rail home-report">
    <Rail items={SECTIONS}/>
    <article className="overview-content">
      <section id="overview" className="hero" style={{paddingTop:0}}>
        <p className="label">{demo ? "Interactive preview · sample data" : "AI activity observatory"}</p>
        <h1>AI activity across the public internet</h1>
        <p>Follow crawlers reading the web, coding agents opening pull requests, and automated contributions to shared knowledge. Compare evidence from public platforms and network measurements.</p>
        {demo ? <p className="demo-notice"><strong>These numbers and records are synthetic.</strong> This preview demonstrates the reports and animation. It does not represent actual source measurements.</p> : null}
        <p className="meta">Each source sees a different part of the internet. Counts, attribution rules and observation windows stay attached to their evidence.</p>
        <div className="btn-row"><Link className="btn" href="/traffic">Explore web traffic</Link><Link className="btn secondary" href="/methods">How we measure</Link></div>
      </section>
      <HomeReportHeadlines data={reports}/>
      <section id="flow" className="overview-report" aria-labelledby="agents-destinations">
        <FigureHead id="agents-destinations" title="Agents → destinations" sub="Recorded contributions across code repositories, encyclopedias, maps and forums."/>
        <AgentFlow data={flow} records={records}/>
      </section>
      <HomeReports data={reports}/>
      <ReadingReport data={reading} demo={demo}/>
      <SocialReport data={social}/>
      <section id="latest" className="overview-report" aria-labelledby="latest-evidence">
        <FigureHead id="latest-evidence" title="Latest records across public sources" sub="Individual examples of external activity, not a combined activity count." more={{href:"/data",label:"Data and source status →"}}/>
        {records.length ? <div className="records">{records.slice(0,6).map(r => <div className="record" key={r.id}>
          <time className="when" dateTime={r.ts}>{fmtStamp(r.ts)}</time>
          <span className="what"><span className="badge kind">{r.kind}</span><strong>{r.actor}</strong> {r.action} {r.url ? <a href={r.url}>{r.target}</a> : r.target}</span>
          <SaveButton item={{id:r.id,kind:r.kind,title:r.actor+" "+r.action+" "+r.target,url:r.url}}/>
        </div>)}</div> : <p className="empty">Records appear as external source collection succeeds.</p>}
      </section>
      <div className="home-links"><Link href="/wikipedia">Wikipedia</Link><Link href="/maps">Maps</Link><Link href="/forums">Forums</Link><Link href="/tooling">Tooling</Link><Link href="/agents">Agent directory</Link><Link href="/investigations">Research notes</Link></div>
    </article>
  </div>;
}
