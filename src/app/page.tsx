import Link from "next/link";
import { AgentFlow } from "@/components/AgentFlow";
import { TimelineChart } from "@/components/charts";
import { SaveButton } from "@/components/SaveButton";
import { BarList, Empty, FigureHead, StatTiles } from "@/components/ui";
import { fmtInt, fmtPct, fmtStamp } from "@/lib/format";
import { getCategoryBreakdown, getIngestStatus, getOverview, getTrafficByDay, hasDatabase } from "@/lib/stats";
import { getFlowData, getLatestRecords } from "@/lib/stats-sources";
import { CATEGORY_LABELS } from "@/lib/agents/types";
import { SITE } from "@/lib/site";

export const revalidate = 60;

export default async function HomePage() {
  const [overview, trafficRows, categories, records, runs, flow] = await Promise.all([
    getOverview(), getTrafficByDay(30), getCategoryBreakdown(30), getLatestRecords(12), getIngestStatus(), getFlowData(30),
  ]);
  const traffic = trafficRows.slice(Math.max(0, trafficRows.findIndex((d) => d.observed)));
  const latestIngest = runs.filter((r) => r.ok && r.finishedAt).map((r) => r.finishedAt!).sort((a, b) => b.getTime() - a.getTime())[0];
  const hasTraffic = traffic.some((d) => d.total > 0);

  return (
    <div className="shell explorer home-report">
      <section className="hero" style={{ paddingTop: 0 }}>
        <p className="label">AI traffic observatory</p>
        <h1>How AI agents read the web</h1>
        <p>Follow training crawlers, search indexers and user-triggered fetchers. Start with requests observed on this site, then compare the evidence with broader published measurements.</p>
        <p className="meta">This is one website, not a representative sample of the internet. Agent names are claims unless corroborated by a published IP range.</p>
        <div className="btn-row">
          <Link className="btn" href="/traffic">Explore traffic trends</Link>
          <Link className="btn secondary" href="/methods">How we measure</Link>
        </div>
      </section>

      <StatTiles tiles={[
        { value: overview.db && overview.trafficDays7d > 0 ? fmtInt(overview.aiVisits7d) : "–", label: "AI-classified requests here, 7 days", sub: `${overview.trafficDays7d}/7 UTC dates have observations` },
        { value: overview.db ? fmtPct(overview.aiShare7d) : "–", label: "AI share of requests here, 7 days", sub: overview.db ? fmtInt(overview.requests7d) + " total requests recorded" : "Sensor unavailable" },
        { value: overview.db ? fmtInt(overview.distinctAgents30d) : "–", label: "AI agent identities observed, 30 days", sub: "User-agent classification" },
        { value: overview.db ? fmtPct(overview.verifiedShare30d) : "–", label: "IP match among checkable visits, 30 days", sub: "Only operators with published ranges" },
      ]} />

      <section id="flow" aria-labelledby="agents-destinations">
        <FigureHead id="agents-destinations" title="Agents → destinations" sub="Follow the recorded traces: code, requests, edits, maps and forum activity." />
        <AgentFlow data={flow} records={records} />
      </section>

      <p className="dim sans">{overview.db ? `Headline window: ${overview.windowStart} to ${overview.windowEnd} UTC, excluding today.` : "Traffic headlines are unavailable until the sensor is connected."} Missing collection is not a measured zero.</p>
      <FigureHead title="Requests to this site" sub="Daily counts over 30 UTC days. Today's bar is incomplete; missing collection can also lower a count." more={{ href: "/visitors", label: "Visitor evidence →" }} />
      {hasTraffic ? <figure className="home-chart">
        <TimelineChart sharedScale days={traffic.map((d) => d.day)} bars={traffic.map((d) => d.observed ? d.ai : null)} barLabel="AI-classified requests" line={traffic.map((d) => d.observed ? d.total : null)} lineLabel="All requests" title="Daily AI-classified and total requests to this site" />
        <figcaption>Gaps are unobserved days, not measured zeros. Requests are not unique agents, users or tasks. Undeclared automation may appear in the browser-like category. <Link href="/data">Download the underlying data</Link>.</figcaption>
      </figure> : <Empty db={hasDatabase()}>No traffic has been recorded in this window.</Empty>}

      <FigureHead title="Who is requesting pages?" sub="Categories observed here over 30 days; classification and IP checks are separate evidence." />
      <BarList rows={categories.map((r) => ({ key: r.category, label: CATEGORY_LABELS[r.category] ?? r.category, value: r.count }))} />

      <section className="research-links" aria-labelledby="wider-evidence">
        <FigureHead id="wider-evidence" title="Put the traffic in context" sub="Each source has its own coverage and definition. These measures cannot be added into a total for AI activity." />
        <div className="source-grid">
          <Link className="source-card" href="/traffic"><strong>Broader web traffic</strong><p>Cloudflare Radar measurements and crawler blocking in sampled Common Crawl hosts.</p></Link>
          <Link className="source-card" href="/before-after"><strong>Long-term trends</strong><p>Wikimedia readership, questions, code activity and search share. Timing alone does not establish cause.</p></Link>
          <Link className="source-card" href="/github"><strong>Research beyond crawling</strong><p>GitHub coding activity, Wikipedia flags, mapping tools and platform-reported forum activity.</p></Link>
        </div>
        <p className="sans dim">Detailed charts and records: <Link href="/wikipedia">Wikipedia</Link> · <Link href="/maps">Maps</Link> · <Link href="/forums">Forums</Link> · <Link href="/tooling">Tooling</Link> · <Link href="/new-agents">New agents</Link></p>
      </section>

      <FigureHead title="Latest evidence across sources" sub="A mixed record feed, not a combined activity count." more={{ href: "/data", label: "Data and source status →" }} />
      {records.length === 0 ? <p className="empty">Records appear as collection runs succeed.</p> : <div className="records">
        {records.slice(0, 6).map((r) => <div className="record" key={r.id}>
          <time className="when" dateTime={r.ts}>{fmtStamp(r.ts)}</time>
          <span className="what"><span className="badge kind">{r.kind}</span><strong>{r.actor}</strong> {r.action} {r.url ? <a href={r.url}>{r.target}</a> : r.target}</span>
          <SaveButton item={{ id: r.id, kind: r.kind, title: r.actor + " " + r.action + " " + r.target, url: r.url }} />
        </div>)}
      </div>}
      <p className="meta">{latestIngest ? "Latest successful collection: " + fmtStamp(latestIngest) + ". " : "No successful collection timestamp available. "}<Link href="/data">Check each source&apos;s status</Link>; a successful run does not guarantee complete coverage.</p>
      <div className="home-links"><Link href="/agents">Agent directory</Link><Link href="/investigations">Research notes</Link><Link href="/saved">Saved evidence</Link><a href={SITE.repo}>Source code</a></div>
    </div>
  );
}
