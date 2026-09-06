import Link from "next/link";
import { MiniChart, TimelineChart } from "@/components/charts";
import { Rail, type RailItem } from "@/components/Rail";
import { BarList, CategoryBadge, StatTiles, TierBadge } from "@/components/ui";
import industry from "../../data/industry.json";
import { CATALOG, IP_SOURCES } from "@/lib/agents/catalog";
import { fmtDate, fmtInt, fmtPct, fmtStamp, relTime } from "@/lib/format";
import { GITHUB_AGENTS, githubAgentLabel } from "@/lib/github/agents";
import { SITE } from "@/lib/site";
import {
  getForumPosts,
  getGithubByAgent,
  getGuestbook,
  getIngestStatus,
  getOverview,
  getRobotsViolations,
  getTimeline,
  getVisitsByAgent,
  getWikiEdits,
  hasDatabase,
} from "@/lib/stats";

export const revalidate = 60;

const RAIL: RailItem[] = [
  { id: "intro", title: "Introduction" },
  { id: "seeing", title: "What we are seeing" },
  { id: "visitors", title: "Who is visiting this site", level: 3 },
  { id: "robots", title: "Who ignores robots.txt", level: 3 },
  { id: "wikipedia", title: "Wikipedia", level: 3 },
  { id: "github", title: "GitHub", level: 3 },
  { id: "forums", title: "Agent forums", level: 3 },
  { id: "guestbook", title: "Agents wrote here", level: 3 },
  { id: "industry", title: "The bigger picture" },
  { id: "method", title: "Methodology" },
  { id: "ladder", title: "The confidence ladder", level: 3 },
  { id: "limits", title: "Limitations", level: 3 },
  { id: "questions", title: "Open questions" },
  { id: "appendix-honeypot", title: "Appendix: honeypot design" },
  { id: "appendix-data", title: "Appendix: data and API" },
];

function H2({ id, n, children }: { id: string; n: number; children: React.ReactNode }) {
  return (
    <h2 id={id}>
      <span className="num">{String(n).padStart(2, "0")}</span>
      {children}
    </h2>
  );
}

export default async function ReportPage() {
  const db = hasDatabase();
  const [overview, timeline, topAgents, violations, wiki, gh, posts, notes, runs] = await Promise.all([
    getOverview(),
    getTimeline(60),
    getVisitsByAgent(30, 8),
    getRobotsViolations(90),
    getWikiEdits({ perPage: 10 }),
    getGithubByAgent(7),
    getForumPosts(5),
    getGuestbook(5),
    getIngestStatus(),
  ]);
  const days = timeline.map((t) => t.day);
  const anyTraffic = timeline.some((t) => t.aiVisits > 0);
  const lastIngest = runs.find((r) => r.ok)?.finishedAt ?? null;

  return (
    <div className="shell with-rail">
      <Rail items={RAIL} />
      <article className="article prose">
        <h1 id="intro">Tracking autonomous AI agents on the public internet</h1>
        <p className="meta">
          A living report · data updates continuously ·{" "}
          {overview.sensorSince ? `sensor live since ${fmtDate(overview.sensorSince)}` : "sensor not yet connected"}
          {lastIngest ? ` · last ingest ${relTime(lastIngest)}` : ""}
        </p>
        <p className="lede">
          Autonomous AI agents now read, write and act on the open web without a person watching each step. This site is a
          set of sensors pointed at the places where that activity leaves public traces: the AI crawlers and agents that
          visit this very site, edits that Wikipedia flags as AI-generated, pull requests opened by coding agents on GitHub,
          and posts on a forum where only agents can hold accounts.
        </p>
        <p>
          Two questions drive the project. <em>Are AI agents leaving edits and activity in places we can observe?</em> And{" "}
          <em>how much of the traffic websites receive now comes from AI models and agents rather than people?</em> Every
          number below links to the raw rows behind it, and every number carries a label saying how confident we are that an AI
          was involved.
        </p>
        <div className="btn-row">
          <Link className="btn" href="/visitors">
            Open the data explorer
          </Link>
          <Link className="btn secondary" href="/data">
            Download the data
          </Link>
        </div>

        <StatTiles
          tiles={[
            { value: fmtInt(overview.aiVisits7d), label: "AI visits to this site, 7 days", sub: `${fmtPct(overview.aiShare7d)} of all requests` },
            { value: fmtInt(overview.wikiFlagged7d), label: "Wikipedia edits flagged, 7 days" },
            { value: fmtInt(overview.agentPrs7d), label: "GitHub PRs by agent accounts, 7 days", sub: `${fmtInt(overview.codexPrs7d)} more on codex/ branches` },
            { value: fmtInt(overview.forumPosts7d), label: "agent-forum posts, 7 days" },
          ]}
        />

        <H2 id="seeing" n={1}>
          What we are seeing
        </H2>
        {anyTraffic ? (
          <figure>
            <TimelineChart
              days={days}
              bars={timeline.map((t) => t.aiVisits)}
              barLabel="AI visits to this site per day"
              annotations={overview.sensorSince ? [{ day: overview.sensorSince.slice(0, 10), label: "sensor live" }] : []}
              title="AI visits per day"
            />
            <figcaption>
              Requests to gcdtracker.vercel.app classified as AI crawlers, user-triggered fetchers, browsing agents or coding
              tools, per UTC day. Humans, search engines and ordinary bots are counted separately and excluded here.
            </figcaption>
          </figure>
        ) : (
          <div className="callout">
            <p>
              {db
                ? "The sensor is live but has not recorded an AI visit yet. The chart appears with the first one."
                : "The sensor is not connected to a database yet, so no visits are being recorded. Everything else on this page describes what happens once it is."}
            </p>
          </div>
        )}
        <figure>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
            <MiniChart days={days} values={timeline.map((t) => t.wikiFlagged)} label="Wikipedia edits flagged" />
            <MiniChart days={days} values={timeline.map((t) => t.agentPrs)} label="GitHub PRs by agent accounts" />
            <MiniChart days={days} values={timeline.map((t) => t.forumPosts)} label="Agent-forum posts" />
          </div>
          <figcaption>
            The other three sensors over the same 60 days, each on its own scale. GitHub counts are complete UTC days from the
            public search API; Wikipedia counts combine filter-flagged and heuristic edits; forum posts are from Moltbook.
          </figcaption>
        </figure>

        <h3 id="visitors">Who is visiting this site</h3>
        <p>
          Each request is matched against {fmtInt(CATALOG.length)} known agent user-agent tokens and, when the operator publishes
          address ranges ({IP_SOURCES.length} lists, refreshed daily), the source address is checked against them. A visit is{" "}
          <em>verified</em> only when both agree. Anyone can claim to be GPTBot in a user-agent string; an address inside
          OpenAI&apos;s published ranges is much harder to fake.
        </p>
        {topAgents.length > 0 ? (
          <>
            <BarList
              rows={topAgents.map((a) => ({
                key: a.slug,
                label: a.name,
                value: a.hits,
                href: `/agents/${encodeURIComponent(a.slug)}`,
                title: `${a.operator} · ${fmtInt(a.verified)} verified`,
              }))}
            />
            <p className="meta" style={{ marginTop: 8 }}>
              Top agents in the last 30 days · {fmtInt(overview.distinctAgents30d)} distinct agents · {fmtPct(overview.verifiedShare30d)} of
              decidable visits verified. <Link href="/visitors/agents">Full table →</Link>
            </p>
          </>
        ) : (
          <p className="meta">No AI visitor recorded yet.</p>
        )}

        <h3 id="robots">Who ignores robots.txt</h3>
        <p>
          Three honeypot paths exist. One is a link hidden in the footer that no person or screen reader can reach. One is listed
          only as a <code>Disallow</code> line in robots.txt, so visiting it proves the visitor read the file and went there anyway.
          One is mentioned only in llms.txt. All three are disallowed. A hit is recorded as a robots.txt violation together with
          the visitor&apos;s identity.
        </p>
        {violations.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Category</th>
                <th>Hits</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {violations.slice(0, 8).map((v, i) => (
                <tr key={i}>
                  <td className="mono">{v.slug ? <Link href={`/agents/${encodeURIComponent(v.slug)}`}>{v.name}</Link> : v.name.slice(0, 60)}</td>
                  <td>
                    <CategoryBadge category={v.category} />
                  </td>
                  <td>{fmtInt(v.hits)}</td>
                  <td>{relTime(v.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="meta">Nobody has followed a disallowed link yet.</p>
        )}

        <h3 id="wikipedia">Wikipedia</h3>
        <p>
          English Wikipedia runs its own edit filters for suspected AI text. Edits they catch receive public change tags such as{" "}
          <code>possible AI-generated citations</code>; that tag alone has been applied thousands of times. We poll the
          recent-changes feed every half hour and store every edit carrying one of those tags as <em>filter-flagged</em>. We
          also scan edit summaries for editors who say they used an AI tool, and usernames that announce automation, and store
          those as lower-confidence <em>heuristic</em> matches. Since 2026 Wikipedia&apos;s guideline on writing articles with
          large language models amounts to a near ban on LLM-written prose, and the speedy-deletion criterion G15 covers
          unreviewed AI pages, so what remains visible is what slipped through or was declared.
        </p>
        {wiki.rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Page</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {wiki.rows.slice(0, 8).map((e) => (
                <tr key={`${e.wiki}-${e.rcid}`}>
                  <td>{fmtStamp(e.ts)}</td>
                  <td>
                    <a href={e.url}>{e.title}</a>
                  </td>
                  <td>
                    <TierBadge tier={e.tier} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="meta">No flagged edit stored yet.</p>
        )}
        <p className="meta">
          {fmtInt(overview.wikiFlaggedTotal)} flagged edits stored. <Link href="/wikipedia/edits">Browse them →</Link>
        </p>

        <h3 id="github">GitHub</h3>
        <p>
          Coding agents are the most visible autonomous actors on the web because GitHub records who opened every pull request.
          We count PRs per UTC day for {GITHUB_AGENTS.filter((a) => a.tier === "bot-account").length} agent bot accounts identified
          by their numeric ids, from Copilot&apos;s coding agent to Claude, Devin, Jules and Cursor. Two agents do not appear that
          way: OpenAI&apos;s Codex and Cursor&apos;s background agent push under the user&apos;s own account. For those we count PRs
          whose head branch starts with <code>codex/</code>, <code>claude/</code> or <code>cursor/</code>, a fingerprint that
          on a single day in September 2026 matched more pull requests than every bot account combined.
        </p>
        {gh.length > 0 ? (
          <BarList
            rows={gh.slice(0, 10).map((r) => ({
              key: r.agent,
              label: githubAgentLabel(r.agent),
              value: r.prs,
              title: `${r.tier} · ${r.days} days`,
            }))}
            variant="neutral"
          />
        ) : (
          <p className="meta">No GitHub counts stored yet.</p>
        )}
        <p className="meta">
          Pull requests in the last 7 days per agent. <Link href="/github/agents">Per-agent detail →</Link>
        </p>

        <h3 id="forums">Agent forums</h3>
        <p>
          Moltbook is a social network on which only AI agents hold accounts; people can read but not post. It is the one source
          here where AI authorship is certain by construction rather than inferred. We poll its public feed and count posts and
          distinct posting agents per day. Its account totals are known to be inflated by mass registrations, so we never cite
          them.
        </p>
        {posts.length > 0 ? (
          <ul>
            {posts.map((p) => (
              <li key={p.id}>
                <a href={p.url}>{p.title}</a> <span className="meta" style={{ display: "inline" }}>— {p.agent}, {relTime(p.ts)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="meta">No forum posts stored yet.</p>
        )}

        <h3 id="guestbook">Agents wrote here</h3>
        <p>
          Any agent that reads this site can leave a note through a small endpoint documented in llms.txt and on the data page.
          Requests are accepted only from recognised AI user agents or requests signed with Web Bot Auth, one per network per
          hour. It is an open question whether unprompted agents will use it.
        </p>
        {notes.length > 0 ? (
          notes.map((n) => (
            <div className="note" key={n.id}>
              <div className="who">
                <strong>{n.name}</strong>
                {n.operator ? <span>· {n.operator}</span> : null}
                <span>{relTime(n.ts)}</span>
              </div>
              <div className="text">{n.note}</div>
            </div>
          ))
        ) : (
          <p className="meta">No notes yet. {overview.guestbookCount > 0 ? "" : "The book is open."}</p>
        )}

        <H2 id="industry" n={2}>
          The bigger picture
        </H2>
        <p>
          A single small site cannot measure the whole web. For scale, the figures below are quoted from operators who see a
          large share of global traffic. They use different definitions, so treat them as context rather than one dataset.
        </p>
        <figure>
          <BarList
            rows={industry.shares.map((s) => ({ key: s.label, label: s.label, value: s.value, title: `${s.source} (${s.date})` }))}
            format={(n) => `${n}%`}
            variant="neutral"
          />
          <figcaption>
            Share of HTML requests seen by Cloudflare, December 2025. AI bots other than Googlebot were 4.2% of HTML requests,
            almost level with Googlebot itself. Source: {industry.shares[0].source}.
          </figcaption>
        </figure>
        <figure>
          <table>
            <thead>
              <tr>
                <th>Crawler</th>
                <th>Share of crawler traffic, May 2024</th>
                <th>May 2025</th>
              </tr>
            </thead>
            <tbody>
              {industry.crawlerShare.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td>{c.may2024}%</td>
                  <td>{c.may2025}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <figcaption>
            Source: <a href={industry.crawlerShareSource.url}>{industry.crawlerShareSource.source}</a> ({industry.crawlerShareSource.date}).
          </figcaption>
        </figure>
        <ul>
          {industry.facts.map((f) => (
            <li key={f.url + f.text.slice(0, 20)}>
              {f.text} <a href={f.url}>{f.source}</a>
              {f.verified ? "" : " (secondary report; not independently verified)"}
            </li>
          ))}
        </ul>

        <H2 id="method" n={3}>
          Methodology
        </H2>
        <p>
          Everything runs on a small Next.js site. A request classifier sits in front of every page; three scheduled jobs poll
          the Wikipedia recent-changes API, the GitHub search API and Moltbook&apos;s public feed every 30 minutes; published IP
          lists are refreshed daily. Raw rows are kept for AI and honeypot visits only; people are counted, never logged. Source
          addresses are reduced to a network prefix and a salted hash before storage.
        </p>
        <h3 id="ladder">The confidence ladder</h3>
        <p>Every count on this site belongs to one rung. Higher rungs need less interpretation.</p>
        <table>
          <thead>
            <tr>
              <th>Rung</th>
              <th>What it means</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Agent-only platform</td>
              <td>Only AI agents can post, so authorship is certain.</td>
              <td>Moltbook posts</td>
            </tr>
            <tr>
              <td>Verified user agent</td>
              <td>The agent named itself and its address is inside the operator&apos;s published ranges, or it signed the request.</td>
              <td>Visits marked verified or signed</td>
            </tr>
            <tr>
              <td>Bot account</td>
              <td>A GitHub app account with a stable numeric id opened the pull request.</td>
              <td>GitHub bot-account counts</td>
            </tr>
            <tr>
              <td>Fingerprint</td>
              <td>A distinctive pattern such as a <code>codex/</code> branch prefix.</td>
              <td>GitHub branch-prefix counts</td>
            </tr>
            <tr>
              <td>Filter-flagged</td>
              <td>Wikipedia&apos;s own edit filters marked the edit as suspected AI output.</td>
              <td>Wikipedia tier 1</td>
            </tr>
            <tr>
              <td>Self-identified user agent</td>
              <td>The user-agent string names an AI agent but nothing else confirms it.</td>
              <td>Unverified visits</td>
            </tr>
            <tr>
              <td>Heuristic</td>
              <td>An edit summary or username suggests an AI tool; easy to get wrong in both directions.</td>
              <td>Wikipedia tier 2</td>
            </tr>
          </tbody>
        </table>
        <h3 id="limits">Limitations</h3>
        <ul>
          <li>
            A user-agent string is free text. Everything without an IP-range or signature match is a claim, not an identity, and is
            labelled so.
          </li>
          <li>
            Agentic browsers that ship a stock Chrome user agent are invisible at this layer. Their visits are counted as human.
            The counts here are therefore a floor.
          </li>
          <li>Meta, ByteDance, DeepSeek, xAI and most tooling vendors publish no address ranges, so their agents can never be verified.</li>
          <li>
            Wikipedia&apos;s filters catch a particular style of AI writing; they miss careful edits and occasionally flag human ones.
            The heuristic tier is weaker still.
          </li>
          <li>
            GitHub counts come from the public search API, which is rate-limited and sometimes marks results as incomplete. Past days
            are re-queried once and then frozen.
          </li>
          <li>
            This site is new and small. Its own traffic numbers describe one obscure host, not the web. The industry section exists
            for scale.
          </li>
          <li>A person reading the page source can trigger the honeypot on purpose. Such hits look like a browser in the tables.</li>
        </ul>

        <H2 id="questions" n={4}>
          Open questions
        </H2>
        <p>
          <strong>Do agents read llms.txt, and does it change their behaviour?</strong> Fetches of the file are logged, and one of
          the honeypot paths appears only there. If agents follow the instruction not to fetch it, the llms.txt trap stays empty
          while the footer trap fills.
        </p>
        <p>
          <strong>Will an unprompted agent sign the guestbook?</strong> The endpoint is documented where agents look. A note that
          arrives without any person asking for it would be a small but real observation of autonomous behaviour.
        </p>
        <p>
          <strong>How fast is the user-fetch category growing relative to training crawls?</strong> Vendors split their user agents
          along that line deliberately; the visitors explorer separates them.
        </p>

        <H2 id="appendix-honeypot" n={5}>
          Appendix: honeypot design
        </H2>
        <p>
          The footer link is positioned off-screen rather than hidden with <code>display:none</code>, so naive scrapers still see an
          anchor while people and screen readers never encounter it; it carries <code>rel=&quot;nofollow&quot;</code>,{" "}
          <code>aria-hidden</code> and is removed from the tab order. The trap route answers 404 with{" "}
          <code>X-Robots-Tag: noindex</code>. Each of the three tokens appears in exactly one place, so a hit identifies how the
          visitor found the path.
        </p>

        <H2 id="appendix-data" n={6}>
          Appendix: data and API
        </H2>
        <p>
          All tables are downloadable as CSV or JSON on the <Link href="/data">data page</Link>, under CC BY 4.0. The code is MIT
          licensed at <a href={SITE.repo}>{SITE.repo.replace("https://", "")}</a>. Row counts and the last run of every ingest job are
          listed there too.
        </p>
      </article>
    </div>
  );
}
