import Link from "next/link";
import { AgentFlow } from "@/components/AgentFlow";
import { TimelineChart } from "@/components/charts";
import { Rail, type RailItem } from "@/components/Rail";
import { SaveButton } from "@/components/SaveButton";
import { FigureHead, SourceList } from "@/components/ui";
import industry from "../../data/industry.json";
import { fmtDate, fmtInt, fmtPct, relTime } from "@/lib/format";
import { SITE } from "@/lib/site";
import { getIngestStatus, getOverview, hasDatabase } from "@/lib/stats";
import { getFlowData, getLatestRecords, getMcpSummary, getOsmSummary, getSightings, getWatchedSummary } from "@/lib/stats-sources";
import { AGENT_LAUNCHES, AI_MARKERS, fmtMonth, getArchiveMonthly, getArchiveShareByDay, getArchiveSummary, getPackageStats, getRobotsCensus, isPartialArchive, ROBOTS_OPERATORS, ROBOTS_ROLES, shareByWeekday } from "@/lib/stats-census";
import { getSeries } from "@/lib/stats-sources";
import { CalendarHeatmap, type LineSeries, MultiLine } from "@/components/census-charts";
import { BarList } from "@/components/ui";
import { CensusTabs } from "@/components/CensusTabs";

export const revalidate = 60;

const RAIL: RailItem[] = [
  { id: "overview", title: "Overview" },
  { id: "flow", title: "Agents → destinations" },
  { id: "census", title: "The census" },
  { id: "collected", title: "What is collected" },
  { id: "latest", title: "Latest records" },
];

export default async function HomePage() {
  const db = hasDatabase();
  const [archive, archiveMonthly, packages, census, shareDays, wm] = await Promise.all([getArchiveSummary(), getArchiveMonthly(), getPackageStats(), getRobotsCensus(), getArchiveShareByDay(), getSeries("wm-pageviews")]);
  const wmSeries: LineSeries[] = [
    { key: "user", label: "Humans", style: "accent" as const, pts: wm["all-projects:user"] ?? [] },
    { key: "spider", label: "Declared crawlers", style: "ink" as const, pts: wm["all-projects:spider"] ?? [] },
    { key: "automated", label: "Undeclared bots", style: "control" as const, pts: wm["all-projects:automated"] ?? [] },
  ]
    .filter((s) => s.pts.length > 0)
    .map(({ pts, ...s }) => ({ ...s, points: pts.map((p) => ({ x: `${p.period}-01`, y: p.value })) }));
  // Robots wall: the six most-blocked AI crawlers in the latest crawl, Googlebot as the control.
  const pct = (c: (typeof census)[number], t: string) => (c.sites > 0 ? (100 * (c.tokens[t]?.blocked ?? 0)) / c.sites : 0);
  const wallTokens = latestCrawlTokens(census);
  const wallSeries: LineSeries[] = wallTokens.map((t, i) => ({ key: t, label: t, style: i === 0 ? "accent" : "ink", points: census.map((c) => ({ x: c.date, y: pct(c, t) })) }));
  if (census.length) wallSeries.push({ key: "Googlebot", label: "Googlebot (control)", style: "control", points: census.map((c) => ({ x: c.date, y: pct(c, "Googlebot") })) });
  const weekday = shareByWeekday(shareDays);
  const maxShareDay = shareDays.reduce((m, d) => Math.max(m, d.share ?? 0), 0);
  const weekendLift = weekday[6].share > 0 && weekday[0].share > 0;
  const latestCrawl = census.at(-1) ?? null;
  const agentPkgs = packages.filter((p) => p.def.role === "agent");
  const agentInstalls7d = agentPkgs.reduce((s, p) => s + p.last7, 0);
  const [overview, watched, runs, flow, records, osm, mcp, sightings] = await Promise.all([
    getOverview(),
    getWatchedSummary(),
    getIngestStatus(),
    getFlowData(30),
    getLatestRecords(12),
    getOsmSummary(),
    getMcpSummary(30),
    getSightings(1),
  ]);
  const lastIngest = runs.find((r) => r.ok)?.finishedAt ?? null;
  const aiBots = industry.shares.find((x) => x.label.startsWith("All other AI bots"));
  const fetchGrowth = industry.facts[0];

  const tabs = [
    archiveMonthly.length > 1
      ? {
          id: "month",
          label: "GitHub, by month",
          panel: (
            <figure className="home-chart">
              <TimelineChart
                days={archiveMonthly.map((m) => `${m.period}-01`)}
                bars={archiveMonthly.map((m) => m.agentPrs)}
                barLabel="Agent PRs opened per month, all of GitHub"
                line={archiveMonthly.map((m) => (m.prsOpened > 0 ? (100 * m.agentPrs) / m.prsOpened : 0))}
                lineLabel="Share of all PRs opened (%)"
                annotations={[...AI_MARKERS, ...AGENT_LAUNCHES].filter((l) => archiveMonthly.some((m) => m.period === l.day.slice(0, 7))).map((l) => ({ ...l, day: `${l.day.slice(0, 7)}-01` }))}
                title="Agent pull requests across all of GitHub, by month"
                xLabel={fmtMonth}
                muted={archiveMonthly.map(isPartialArchive)}
              />
              <figcaption>
                Pull requests opened by coding agents across every public repository, and their share of all pull requests opened: a census of GH Archive since{" "}
                {archive.firstDay ? fmtMonth(archive.firstDay) : "2025"}, {fmtInt(archive.hours)} hours counted.{archiveMonthly.some(isPartialArchive) ? " Pale bars: months where GH Archive captured only part of the feed; read the share, not the count." : ""}{" "}
                <Link href="/github">Full census →</Link>
              </figcaption>
            </figure>
          ),
        }
      : null,
    shareDays.length > 30
      ? {
          id: "day",
          label: "Agent share, by day",
          panel: (
            <figure className="home-chart">
              <div className="label" style={{ marginBottom: 8 }}>
                Agent share of GitHub pull requests, per day
              </div>
              <CalendarHeatmap
                label="Agent share of pull requests, per day"
                days={shareDays.map((d) => ({
                  day: d.day,
                  value: d.share,
                  partial: d.partial,
                  title: `${d.day} · ${d.share === null ? "no data" : fmtPct(d.share)} · ${fmtInt(d.agentPrs)} of ${fmtInt(d.prsOpened)} PRs${d.hours < 24 ? ` · ${d.hours} of 24 hours` : ""}${d.partial ? " · partial archive" : ""}`,
                }))}
              />
              <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 300px) 1fr", gap: 24, alignItems: "start", marginTop: 14 }}>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    By weekday · last 26 weeks
                  </div>
                  <BarList rows={weekday.map((w) => ({ key: w.label, label: w.label, value: 100 * w.share, title: `${w.days} days` }))} format={(v) => `${v.toFixed(1)}%`} />
                </div>
                <figcaption style={{ marginTop: 0 }}>
                  One cell per UTC day since {fmtDate(shareDays[0].day)}, darker up to {fmtPct(maxShareDay)}; hatched days are ones where GH Archive captured only part of the feed, which a
                  share survives and a count does not.
                  {weekendLift ? ` Agents take a larger slice at the weekend (${fmtPct(weekday[6].share)} on Sundays, ${fmtPct(weekday[0].share)} on Mondays) because humans open fewer pull requests then.` : ""}{" "}
                  <Link href="/github">Method →</Link>
                </figcaption>
              </div>
            </figure>
          ),
        }
      : null,
    wallSeries.length > 1 && latestCrawl
      ? {
          id: "robots",
          label: "Who blocks AI crawlers",
          panel: (
            <figure className="home-chart">
              <MultiLine series={wallSeries} format={(v) => `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}%`} title="Share of the web that fully blocks each AI crawler, per Common Crawl crawl" height={240} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start", marginTop: 12 }}>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Blocked outright · crawl of {fmtDate(latestCrawl.date)} · {fmtInt(latestCrawl.sites)} sites
                  </div>
                  <BarList
                    rows={rankedTokens(latestCrawl).map((r) => ({
                      key: r.token,
                      label: (
                        <>
                          {r.token} <span className="dim">· {ROBOTS_OPERATORS[r.token] ?? ""}</span> <span className={`badge ${r.role === "training" ? "warn" : ""}`}>{r.role}</span>
                        </>
                      ),
                      value: r.blocked,
                      secondary: r.mentioned,
                      title: `named by ${r.mentioned.toFixed(2)}% of sites`,
                    }))}
                    format={(v) => `${v.toFixed(2)}%`}
                  />
                </div>
                <figcaption style={{ marginTop: 0 }}>
                  Share of about {fmtInt(Math.round(latestCrawl.sites / 1000) * 1000)} sampled sites per Common Crawl crawl that give the crawler <code className="mono">Disallow: /</code>,
                  back to January 2023. Whole-web figures, far below the numbers published for large news sites; grey bars show sites that name the token at all.{" "}
                  <Link href="/traffic">Traffic page →</Link>
                </figcaption>
              </div>
            </figure>
          ),
        }
      : null,
    wmSeries.length > 0
      ? {
          id: "before",
          label: "Before and after",
          panel: (
            <figure className="home-chart">
              <MultiLine series={wmSeries} format={(v) => (v === 0 ? "0" : `${(v / 1e9).toFixed(v >= 10e9 ? 0 : 1)}B`)} title="Wikimedia page views per month by agent type" annotations={AI_MARKERS} labelWidth={150} height={240} />
              <figcaption>
                Every request to every Wikimedia project per month, split by the Foundation&apos;s own classifier into humans, declared crawlers and undeclared automation, back to 2015.
                Bot reads climbed after the markers while human reads did not. <Link href="/before-after">Reading, asking, coding and crawling, before and after →</Link>
              </figcaption>
            </figure>
          ),
        }
      : null,
  ].filter((t) => t !== null);

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

        <div className="tiles six">
          {[
            archive.latest
              ? { value: fmtInt(archive.last7.agentPrs), label: `GitHub PRs by agents, last ${archive.last7.days} days`, sub: `${archive.last7.prsOpened > 0 ? fmtPct(archive.last7.agentPrs / archive.last7.prsOpened, 2) : "–"} of every PR opened · census` }
              : { value: fmtInt(overview.agentPrs7d), label: "GitHub PRs by agent accounts, 7 days", sub: `+${fmtInt(overview.codexPrs7d)} on codex/ branches · ${fmtInt(watched.last7d)} in watched repos` },
            { value: latestCrawl ? fmtPct((latestCrawl.tokens.GPTBot?.blocked ?? 0) / latestCrawl.sites, 2) : "–", label: "of sampled sites block GPTBot", sub: latestCrawl ? `Common Crawl, ${fmtDate(latestCrawl.date)}` : "robots.txt census" },
            { value: agentInstalls7d > 0 ? fmtInt(agentInstalls7d) : "–", label: "agent CLI installs, 7 days", sub: agentPkgs[0]?.last7 ? `${agentPkgs[0].def.label} leads · npm + PyPI` : "npm + PyPI" },
            { value: fmtInt(overview.wikiFlagged7d), label: "Wikipedia edits flagged, 7 days", sub: "edit filters, possibly AI-generated" },
            { value: aiBots ? `${aiBots.value}%` : "4.2%", label: "of HTML requests from AI bots other than Googlebot", sub: "Cloudflare Radar, Dec 2025 · quoted" },
            { value: "15×", label: "growth in user-triggered AI fetches in 2025", sub: `${fetchGrowth?.source ?? "Cloudflare Radar"} · quoted` },
          ].map((t, i) => (
            <div className="tile" key={i}>
              <div className="num">{t.value}</div>
              <div className="lbl">{t.label}</div>
              {t.sub ? <div className="sub">{t.sub}</div> : null}
            </div>
          ))}
        </div>

        <FigureHead id="flow" title="Agents → destinations" sub={`Who acts where, from the last ${flow.days} days of every sensor. Link width follows real counts; the ticker replays actual records.`} />
        <AgentFlow data={flow} records={records} />

        {tabs.length > 0 ? (
          <>
            <FigureHead id="census" title="The census" sub="Multi-year measurements kept by the workers: GitHub, the web's robots.txt, and Wikimedia's readership, each with a baseline from before AI." />
            <CensusTabs label="Census views" tabs={tabs} />
          </>
        ) : null}

        <FigureHead id="collected" title="What is collected" more={{ href: "/methods", label: "methods and the confidence ladder →" }} />
        <SourceList
          items={[
            { title: "This site's visitors", what: "Every request classified by user agent and signature, then checked against the operator's published IP ranges; three honeypots catch robots.txt violators.", rung: "verified user agent", value: fmtInt(overview.aiVisitsTotal), valueLabel: "AI visits recorded", href: "/visitors" },
            { title: "Wikipedia & Wikimedia", what: "Edits Wikipedia's own filters tag as possibly AI-generated, bot volume across every major project, AI-generated media on Commons.", rung: "filter-flagged", value: fmtInt(overview.wikiFlaggedTotal), valueLabel: "flagged edits stored", href: "/wikipedia" },
            { title: "GitHub", what: "A census of every public event since January 2025, plus every agent PR in watched repositories with its evidence and self-disclosure signals.", rung: "bot account", value: archive.completeDays > 0 ? fmtInt(archive.completeDays) : fmtInt(watched.total), valueLabel: archive.completeDays > 0 ? "days of history counted" : "documented PRs in watched repos", href: "/github" },
            { title: "Maps", what: "OpenStreetMap changesets made with AI-suggested geometry, automated QA tools, or bots, sampled from the public feed.", rung: "self-identified", value: fmtInt(osm.ai7d), valueLabel: "AI-assisted changesets, 7 days", href: "/maps" },
            { title: "Agent forums", what: "Posts on Moltbook, where only AI agents hold accounts, plus notes agents leave in this site's guestbook.", rung: "agent-only platform", value: fmtInt(overview.forumPosts7d), valueLabel: "posts in 7 days", href: "/forums" },
            { title: "Tooling", what: "Downloads of agent CLIs and frameworks from npm and PyPI, MCP servers published per day, AI-attributed commits, Hugging Face agent usage.", rung: "quoted source", value: agentInstalls7d > 0 ? fmtInt(agentInstalls7d) : fmtInt(mcp.new7d), valueLabel: agentInstalls7d > 0 ? "agent CLI installs, 7 days" : "MCP servers published, 7 days", href: "/tooling" },
            { title: "New agents", what: "Crawler tokens dated from the ai.robots.txt history and agents that cryptographically sign their requests.", rung: "self-identified", value: fmtInt(sightings.counts["signature-registry"] ?? 0), valueLabel: "agents that sign requests", href: "/new-agents" },
            { title: "Traffic", what: "This site's AI share, internet-scale figures from Cloudflare Radar, and the robots.txt census of which crawlers the web blocks.", rung: "quoted source", value: latestCrawl ? fmtPct((latestCrawl.tokens.GPTBot?.blocked ?? 0) / latestCrawl.sites, 2) : fmtPct(overview.aiShare7d), valueLabel: latestCrawl ? "of sampled sites block GPTBot" : "AI share here, 7 days", href: "/traffic" },
          ]}
        />

        <FigureHead id="latest" title="Latest records" more={{ href: "/data", label: "all records and downloads →" }} />
        {records.length === 0 ? (
          <p className="empty">Records appear here as the sensors pick them up.</p>
        ) : (
          <div className="records">
            {records.slice(0, 6).map((r) => (
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
          <Link href="/before-after">Before and after</Link>
          <Link href="/investigations">Notes</Link>
          <a href={SITE.repo}>Source code</a>
        </div>
      </div>
    </div>
  );
}

/** The six AI crawlers most often blocked in the latest crawl (controls and the wildcard excluded). */
function latestCrawlTokens(census: Awaited<ReturnType<typeof getRobotsCensus>>): string[] {
  const latest = census.at(-1);
  if (!latest) return [];
  return Object.entries(latest.tokens)
    .filter(([t]) => ROBOTS_ROLES[t] && ROBOTS_ROLES[t] !== "control")
    .sort((a, b) => b[1].blocked - a[1].blocked)
    .slice(0, 6)
    .map(([t]) => t);
}

function rankedTokens(c: Awaited<ReturnType<typeof getRobotsCensus>>[number]) {
  return Object.entries(c.tokens)
    .filter(([t]) => ROBOTS_ROLES[t] && ROBOTS_ROLES[t] !== "control")
    .map(([t, v]) => ({ token: t, role: ROBOTS_ROLES[t], blocked: (100 * v.blocked) / c.sites, mentioned: (100 * v.mentioned) / c.sites }))
    .sort((a, b) => b.blocked - a.blocked)
    .slice(0, 8);
}
