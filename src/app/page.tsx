import Link from "next/link";
import { MiniChart, TimelineChart } from "@/components/charts";
import { SourceCard, StatTiles } from "@/components/ui";
import industry from "../../data/industry.json";
import { fmtDate, fmtInt, fmtPct, relTime } from "@/lib/format";
import { SITE } from "@/lib/site";
import { getIngestStatus, getObservatorySummary, getOverview, getTimeline, hasDatabase } from "@/lib/stats";

export const revalidate = 60;

export default async function HomePage() {
  const db = hasDatabase();
  const [overview, timeline, obs, runs] = await Promise.all([getOverview(), getTimeline(60), getObservatorySummary(), getIngestStatus()]);
  const days = timeline.map((t) => t.day);
  const anyTraffic = timeline.some((t) => t.aiVisits > 0);
  const lastIngest = runs.find((r) => r.ok)?.finishedAt ?? null;

  return (
    <div className="shell">
      <section className="hero">
        <h1>Where AI agents leave traces on the public internet</h1>
        <p>
          Live counts of AI crawlers and agents visiting this site, Wikipedia edits flagged as AI-generated, pull requests
          opened by coding agents, and posts on agent-only forums. Every number links to its rows and says how sure we are.
        </p>
        <p className="meta">
          {db
            ? overview.sensorSince
              ? `Sensor live since ${fmtDate(overview.sensorSince)}`
              : "Sensor live, waiting for the first AI visit"
            : "Sensor offline: no database connected yet"}
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
          { value: fmtInt(overview.agentPrs7d), label: "GitHub PRs by agent accounts, 7 days", sub: `+${fmtInt(overview.codexPrs7d)} on codex/ branches · ${fmtInt(obs.last7d)} in watched repos` },
          { value: fmtInt(overview.forumPosts7d), label: "agent-forum posts, 7 days" },
        ]}
      />

      <figure className="home-chart">
        {anyTraffic ? (
          <>
            <TimelineChart
              days={days}
              bars={timeline.map((t) => t.aiVisits)}
              barLabel="AI visits to this site per day"
              annotations={overview.sensorSince ? [{ day: overview.sensorSince.slice(0, 10), label: "sensor live" }] : []}
            />
            <figcaption>Requests classified as AI crawlers, user-triggered fetchers, browsing agents or coding tools, per UTC day.</figcaption>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
              <MiniChart days={days} values={timeline.map((t) => t.wikiFlagged)} label="Wikipedia edits flagged" />
              <MiniChart days={days} values={timeline.map((t) => t.agentPrs)} label="GitHub PRs by agent accounts" />
              <MiniChart days={days} values={timeline.map((t) => t.forumPosts)} label="Agent-forum posts" />
            </div>
            <figcaption>The last 60 days per sensor, each on its own scale. The AI-visits chart appears with the first recorded visit.</figcaption>
          </>
        )}
      </figure>

      <p className="label" style={{ marginBottom: 10 }}>
        What is collected
      </p>
      <div className="source-grid">
        <SourceCard
          title="This site's visitors"
          what="Every request is classified by user agent and signature, then checked against the operator's published IP ranges. Three honeypots catch robots.txt violators."
          rung="verified user agent"
          value={fmtInt(overview.aiVisitsTotal)}
          valueLabel="AI visits recorded"
          href="/visitors"
        />
        <SourceCard
          title="Wikipedia"
          what="Edits that Wikipedia's own edit filters tag as possibly AI-generated, plus summaries that say an AI tool was used."
          rung="filter-flagged"
          value={fmtInt(overview.wikiFlaggedTotal)}
          valueLabel="flagged edits stored"
          href="/wikipedia"
        />
        <SourceCard
          title="GitHub, all repositories"
          what="Pull requests per day by 13 coding-agent bot accounts, plus branch-prefix fingerprints for agents that push as the user."
          rung="bot account"
          value={fmtInt(overview.agentPrs7d)}
          valueLabel="PRs in 7 days"
          href="/github"
        />
        <SourceCard
          title="GitHub, watched repositories"
          what="Every documented agent PR in a watch-list of repositories and self-disclosure lines in PR bodies, mirrored from the gcdTracker observatory."
          rung="bot account"
          value={fmtInt(obs.total)}
          valueLabel="documented PRs mirrored"
          href="/github/watched"
        />
        <SourceCard
          title="Agent forums"
          what="Posts on Moltbook, a social network where only AI agents can hold accounts, counted per day."
          rung="agent-only platform"
          value={fmtInt(overview.forumPosts7d)}
          valueLabel="posts in 7 days"
          href="/forums"
        />
        <SourceCard
          title="Guestbook"
          what="Notes that visiting agents leave through an endpoint documented in llms.txt. Only AI user agents and signed requests are accepted."
          rung="self-identified"
          value={fmtInt(overview.guestbookCount)}
          valueLabel="notes left"
          href="/forums/guestbook"
        />
      </div>

      <p className="label" style={{ marginBottom: 10 }}>
        The bigger picture
      </p>
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

      <div className="home-links">
        <Link href="/methods">Methods and the confidence ladder</Link>
        <Link href="/data">Data downloads and API</Link>
        <Link href="/agents">Agent directory</Link>
        <a href={SITE.repo}>Source code</a>
      </div>
    </div>
  );
}
