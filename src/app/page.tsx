import Link from "next/link";
import { AgentFlow } from "@/components/AgentFlow";
import { MiniChart, TimelineChart } from "@/components/charts";
import { Rail, type RailItem } from "@/components/Rail";
import { SaveButton } from "@/components/SaveButton";
import { SourceCard, StatTiles } from "@/components/ui";
import industry from "../../data/industry.json";
import { fmtDate, fmtInt, fmtPct, relTime } from "@/lib/format";
import { SITE } from "@/lib/site";
import { getIngestStatus, getOverview, getTimeline, hasDatabase } from "@/lib/stats";
import { getFlowData, getLatestRecords, getMcpSummary, getOsmSummary, getSightings, getWatchedSummary } from "@/lib/stats-sources";
import { AGENT_LAUNCHES, fmtMonth, getArchiveMonthly, getArchiveSummary, getPackageStats, getRobotsCensus, isPartialArchive } from "@/lib/stats-census";

export const revalidate = 60;

const RAIL: RailItem[] = [
  { id: "overview", title: "Overview" },
  { id: "flow", title: "Agents → destinations" },
  { id: "collected", title: "What is collected" },
  { id: "picture", title: "The bigger picture" },
  { id: "latest", title: "Latest records" },
];

export default async function HomePage() {
  const db = hasDatabase();
  const [archive, archiveMonthly, packages, census] = await Promise.all([getArchiveSummary(), getArchiveMonthly(), getPackageStats(), getRobotsCensus()]);
  const latestCrawl = census.at(-1) ?? null;
  const agentInstalls7d = packages.filter((p) => p.def.role === "agent").reduce((s, p) => s + p.last7, 0);
  const [overview, timeline, watched, runs, flow, records, osm, mcp, sightings] = await Promise.all([
    getOverview(),
    getTimeline(60),
    getWatchedSummary(),
    getIngestStatus(),
    getFlowData(30),
    getLatestRecords(12),
    getOsmSummary(),
    getMcpSummary(30),
    getSightings(1),
  ]);
  const days = timeline.map((t) => t.day);
  const anyTraffic = timeline.some((t) => t.aiVisits > 0);
  const lastIngest = runs.find((r) => r.ok)?.finishedAt ?? null;

  return (
    <div className="shell with-rail">
      <Rail items={RAIL} />
      <div className="article">
        <section className="hero" id="overview" style={{ paddingTop: 0 }}>
          <h1>Where AI agents leave traces on the public internet</h1>
          <p>
            Live counts of AI crawlers and agents visiting this site, Wikipedia edits flagged as AI-generated, pull requests
            opened by coding agents, AI-assisted map edits, and posts on agent-only forums. Every number links to its rows and
            says how sure we are.
          </p>
          <p className="meta">
            {db ? (overview.sensorSince ? `Sensor live since ${fmtDate(overview.sensorSince)}` : "Sensor live, waiting for the first AI visit") : "Sensor offline: no database connected yet"}
            {lastIngest ? ` · last ingest ${relTime(lastIngest)}` : ""} · updates every 30 minutes
          </p>
          <div className="btn-row">
            <Link className="btn" href="/visitors">
              Explore the data
            </Link>
            <Link className="btn secondary" href="/methods">
              How it is measured
            </Link>
          </div>
        </section>

        <StatTiles
          tiles={[
            { value: fmtInt(overview.aiVisits7d), label: "AI visits to this site, 7 days", sub: `${fmtPct(overview.aiShare7d)} of all requests` },
            { value: fmtInt(overview.wikiFlagged7d), label: "Wikipedia edits flagged, 7 days" },
            archive.latest
              ? { value: fmtInt(archive.last7.agentPrs), label: `GitHub PRs by agents, last ${archive.last7.days} days`, sub: `${archive.last7.prsOpened > 0 ? fmtPct(archive.last7.agentPrs / archive.last7.prsOpened, 2) : "–"} of every PR opened on GitHub · census` }
              : { value: fmtInt(overview.agentPrs7d), label: "GitHub PRs by agent accounts, 7 days", sub: `+${fmtInt(overview.codexPrs7d)} on codex/ branches · ${fmtInt(watched.last7d)} in watched repos` },
            { value: fmtInt(overview.forumPosts7d), label: "agent-forum posts, 7 days" },
          ]}
        />

        <h2 id="flow" className="page-title" style={{ fontSize: 26, margin: "26px 0 4px", scrollMarginTop: 80 }}>
          Agents → destinations
        </h2>
        <p className="page-sub">Who acts where, from the last {flow.days} days of every sensor. Link width follows real counts; the ticker replays actual records.</p>
        <AgentFlow data={flow} records={records} />

        {archiveMonthly.length > 1 ? (
          <figure className="home-chart">
            <TimelineChart
              days={archiveMonthly.map((m) => `${m.period}-01`)}
              bars={archiveMonthly.map((m) => m.agentPrs)}
              barLabel="Agent PRs opened per month, all of GitHub"
              line={archiveMonthly.map((m) => (m.prsOpened > 0 ? (100 * m.agentPrs) / m.prsOpened : 0))}
              lineLabel="Share of all PRs opened (%)"
              annotations={AGENT_LAUNCHES.filter((l) => archiveMonthly.some((m) => m.period === l.day.slice(0, 7))).map((l) => ({ ...l, day: `${l.day.slice(0, 7)}-01` }))}
              title="Agent pull requests across all of GitHub, by month"
              xLabel={fmtMonth}
              muted={archiveMonthly.map(isPartialArchive)}
            />
            <figcaption>
              Pull requests opened by coding agents across every public repository on GitHub, per month, and their share of all pull requests opened: a census of GH Archive since
              January 2025, {fmtInt(archive.hours)} hours counted so far.
              {archiveMonthly.some(isPartialArchive)
                ? ` Pale bars (${archiveMonthly.filter(isPartialArchive).map((m) => fmtMonth(`${m.period}-01`)).join(", ")}) are months where GH Archive captured only part of GitHub's feed, so the counts are floors while the share holds.`
                : ""}{" "}
              <Link href="/github">Full census →</Link>
            </figcaption>
          </figure>
        ) : null}

        <figure className="home-chart">
          {anyTraffic ? (
            <>
              <TimelineChart days={days} bars={timeline.map((t) => t.aiVisits)} barLabel="AI visits to this site per day" annotations={overview.sensorSince ? [{ day: overview.sensorSince.slice(0, 10), label: "sensor live" }] : []} />
              <figcaption>Requests classified as AI crawlers, user-triggered fetchers, browsing agents or coding tools, per UTC day.</figcaption>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
                <MiniChart days={days} values={timeline.map((t) => t.wikiFlagged)} label="Wikipedia edits flagged" />
                <MiniChart days={days} values={timeline.map((t) => t.agentPrs)} label="GitHub PRs by agent accounts" />
                <MiniChart days={days} values={timeline.map((t) => t.forumPosts)} label="Agent-forum posts" />
              </div>
              <figcaption>The last 60 days per sensor, each on its own scale.</figcaption>
            </>
          )}
        </figure>

        <h2 id="collected" className="page-title" style={{ fontSize: 26, margin: "10px 0 12px", scrollMarginTop: 80 }}>
          What is collected
        </h2>
        <div className="source-grid">
          <SourceCard title="This site's visitors" what="Every request classified by user agent and signature, then checked against the operator's published IP ranges. Three honeypots catch robots.txt violators." rung="verified user agent" value={fmtInt(overview.aiVisitsTotal)} valueLabel="AI visits recorded" href="/visitors" />
          <SourceCard title="Wikipedia & Wikimedia" what="Edits Wikipedia's own filters tag as possibly AI-generated, bot volume across every major Wikimedia project, and AI-generated media on Commons." rung="filter-flagged" value={fmtInt(overview.wikiFlaggedTotal)} valueLabel="flagged edits stored" href="/wikipedia" />
          <SourceCard title="GitHub" what="A census of every public GitHub event since January 2025: pull requests by coding agents as a share of all PRs. Plus every agent PR in watched repositories with its evidence and self-disclosure signals." rung="bot account" value={archive.completeDays > 0 ? fmtInt(archive.completeDays) : fmtInt(watched.total)} valueLabel={archive.completeDays > 0 ? "days of GitHub history counted" : "documented PRs in watched repos"} href="/github" />
          <SourceCard title="Maps" what="OpenStreetMap changesets made with AI-suggested geometry (RapiD, MapWithAI), automated QA tools, or bots, sampled from the public feed." rung="self-identified" value={fmtInt(osm.ai7d)} valueLabel="AI-assisted changesets, 7 days" href="/maps" />
          <SourceCard title="Agent forums" what="Posts on Moltbook, a social network where only AI agents hold accounts, plus notes agents leave in this site's guestbook." rung="agent-only platform" value={fmtInt(overview.forumPosts7d)} valueLabel="posts in 7 days" href="/forums" />
          <SourceCard title="Tooling" what="Downloads of agent CLIs and agent frameworks from npm and PyPI, MCP servers published per day, AI-attributed commits, and which coding agents use the Hugging Face Hub." rung="quoted source" value={agentInstalls7d > 0 ? fmtInt(agentInstalls7d) : fmtInt(mcp.new7d)} valueLabel={agentInstalls7d > 0 ? "agent CLI installs, 7 days" : "MCP servers published, 7 days"} href="/tooling" />
          <SourceCard title="New agents" what="Newly published crawler tokens and agents that cryptographically sign their requests, diffed daily from two public registries." rung="self-identified" value={fmtInt(sightings.counts["signature-registry"] ?? 0)} valueLabel="agents that sign requests" href="/new-agents" />
          <SourceCard title="Traffic" what="How much of the web's requests are AI: this site's own share, internet-scale figures from Cloudflare Radar, and a robots.txt census of which AI crawlers the web blocks, per crawl since 2023." rung="quoted source" value={latestCrawl ? fmtPct((latestCrawl.tokens.GPTBot?.blocked ?? 0) / latestCrawl.sites, 2) : fmtPct(overview.aiShare7d)} valueLabel={latestCrawl ? "of sampled sites block GPTBot" : "AI share here, 7 days"} href="/traffic" />
        </div>

        <h2 id="picture" className="page-title" style={{ fontSize: 26, margin: "10px 0 12px", scrollMarginTop: 80 }}>
          The bigger picture
        </h2>
        <div className="picture">
          <div className="fact">
            <span className="big">4.2%</span>
            of HTML requests seen by Cloudflare in late 2025 came from AI bots other than Googlebot, almost level with Googlebot itself.{" "}
            <a href={industry.shares[0].url}>Cloudflare Radar</a>
          </div>
          <div className="fact">
            <span className="big">2.2% → 7.7%</span>
            GPTBot&apos;s share of crawler traffic from May 2024 to May 2025, while ClaudeBot fell from 11.7% to 5.4%.{" "}
            <a href={industry.crawlerShareSource.url}>Cloudflare</a>
          </div>
          <div className="fact">
            <span className="big">15×</span>
            growth in user-triggered AI fetches during 2025, driven by ChatGPT-User: people asking assistants to read pages.{" "}
            <a href={industry.facts[0].url}>Cloudflare Radar</a>
          </div>
        </div>

        <h2 id="latest" className="page-title" style={{ fontSize: 26, margin: "10px 0 12px", scrollMarginTop: 80 }}>
          Latest records
        </h2>
        {records.length === 0 ? (
          <p className="empty">Records appear here as the sensors pick them up.</p>
        ) : (
          <div className="records">
            {records.map((r) => (
              <div className="record" key={r.id}>
                <span className="when" title={r.ts}>
                  {relTime(r.ts)}
                </span>
                <span className="what">
                  <span className="badge kind">{r.kind}</span>
                  <strong>{r.actor}</strong> {r.action} {r.url ? <a href={r.url}>{r.target}</a> : r.target}
                </span>
                <SaveButton item={{ id: r.id, kind: r.kind, title: `${r.actor} ${r.action} ${r.target}`, url: r.url }} />
              </div>
            ))}
          </div>
        )}

        <div className="home-links">
          <Link href="/methods">Methods and the confidence ladder</Link>
          <Link href="/data">Data downloads and API</Link>
          <Link href="/agents">Agent directory</Link>
          <Link href="/investigations">Notes</Link>
          <a href={SITE.repo}>Source code</a>
        </div>
      </div>
    </div>
  );
}
