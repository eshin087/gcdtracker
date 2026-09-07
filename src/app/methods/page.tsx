import type { Metadata } from "next";
import Link from "next/link";
import { Rail, type RailItem } from "@/components/Rail";
import industry from "../../../data/industry.json";
import { CATALOG, IP_SOURCES } from "@/lib/agents/catalog";
import { GITHUB_AGENTS } from "@/lib/github/agents";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Methods",
  description: "How each gcdTracker sensor works, the confidence ladder behind every number, and what the data cannot show.",
};

const RAIL: RailItem[] = [
  { id: "sensors", title: "The sensors" },
  { id: "visitors", title: "This site's visitors", level: 3 },
  { id: "honeypot", title: "Honeypots", level: 3 },
  { id: "wikipedia", title: "Wikipedia", level: 3 },
  { id: "github", title: "GitHub", level: 3 },
  { id: "watched", title: "Watched repositories", level: 3 },
  { id: "maps", title: "Maps", level: 3 },
  { id: "tooling", title: "Tooling and quoted sources", level: 3 },
  { id: "forums", title: "Agent forums and guestbook", level: 3 },
  { id: "ladder", title: "The confidence ladder" },
  { id: "limits", title: "Limitations" },
  { id: "industry", title: "The bigger picture" },
  { id: "questions", title: "Open questions" },
  { id: "data", title: "Data, API and licences" },
];

export default function MethodsPage() {
  return (
    <div className="shell with-rail">
      <Rail items={RAIL} />
      <article className="article prose">
        <h1>Methods</h1>
        <p className="lede">
          How each sensor works, what rung of the confidence ladder its numbers sit on, and what the data cannot show.
        </p>

        <h2 id="sensors">The sensors</h2>
        <p>
          Everything runs on a small Next.js site. A request classifier sits in front of every page; scheduled jobs poll the
          Wikipedia recent-changes API, the Wikimedia metrics API, the GitHub search API, OpenStreetMap, the MCP registry and
          Moltbook&apos;s public feed every 30 minutes; published IP lists are refreshed daily. Raw rows are kept for AI and honeypot visits only; people are counted,
          never logged. Source addresses are reduced to a network prefix and a salted hash before storage.
        </p>

        <h3 id="visitors">This site&apos;s visitors</h3>
        <p>
          Each request is matched against {CATALOG.length} known agent user-agent tokens (curated from vendor documentation plus the
          ai.robots.txt list) and, when the operator publishes address ranges ({IP_SOURCES.length} lists), the source address is
          checked against them. A visit is <em>verified</em> only when both agree: anyone can claim to be GPTBot in a user-agent
          string, but an address inside OpenAI&apos;s published ranges is much harder to fake. Requests carrying Web Bot Auth
          signature headers are recorded as <em>signed</em>. Vendors split their agents into training crawlers, search indexers,
          user-triggered fetchers, browsing agents and coding tools; the classifier keeps those categories apart, and never counts
          classic search engines or link previewers as AI.
        </p>

        <h3 id="honeypot">Honeypots</h3>
        <p>
          Three disallowed paths exist. One is a link hidden in the footer, positioned off-screen rather than hidden with{" "}
          <code>display:none</code>, so naive scrapers still see an anchor while people and screen readers never encounter it. One is
          listed only as a <code>Disallow</code> line in robots.txt, so visiting it proves the visitor read the file and went there
          anyway. One is mentioned only in llms.txt. The trap route answers 404 with <code>X-Robots-Tag: noindex</code>. Each token
          appears in exactly one place, so a hit identifies how the visitor found the path.
        </p>

        <h3 id="wikipedia">Wikipedia</h3>
        <p>
          English Wikipedia runs its own edit filters for suspected AI text. Edits they catch receive public change tags such as{" "}
          <code>possible AI-generated citations</code>. We poll the recent-changes feed and store every edit carrying one of those
          tags as <em>filter-flagged</em>. We also scan edit summaries for editors who say they used an AI tool, and usernames that
          announce automation, and store those as lower-confidence <em>heuristic</em> matches. Daily totals come from the
          Wikimedia metrics API, which lags a few days. Since 2026 Wikipedia&apos;s guideline on writing articles with large language
          models amounts to a near ban on LLM-written prose, and speedy-deletion criterion G15 covers unreviewed AI pages, so what
          remains visible is what slipped through or was declared.
        </p>

        <h3 id="github">GitHub</h3>
        <p>
          Coding agents are the most visible autonomous actors on the web because GitHub records who opened every pull request. We
          count PRs per UTC day for {GITHUB_AGENTS.filter((a) => a.tier === "bot-account").length} agent bot accounts identified by
          their numeric ids, from Copilot&apos;s coding agent to Claude, Devin, Jules and Cursor. Two agents do not appear that way:
          OpenAI&apos;s Codex and Cursor&apos;s background agent push under the user&apos;s own account. For those we count PRs whose head
          branch starts with <code>codex/</code>, <code>claude/</code> or <code>cursor/</code>, a fingerprint that on a single day
          in September 2026 matched more pull requests than every bot account combined. Past days are queried once and frozen.
        </p>
        <p>
          The search API caps every query at a thousand results, so since phase 4 the headline GitHub numbers come from a census
          instead: GH Archive publishes every public GitHub event, hour by hour, and a worker in GitHub Actions streams each hourly
          file (70 to 150 MB) and counts pull requests opened by the same bot accounts and branch prefixes, alongside every pull
          request opened that hour. That gives agent PRs as a share of all PRs, back to January 2022, with no sampling. Two
          caveats come from GitHub, not from us: during 2025 the public event payloads were slimmed, so commit messages (which
          carried AI co-author trailers) end in the autumn of 2025, and PR bodies end at the same time. The census marks which
          measures each hour supports rather than showing zeros.
        </p>

        <h3 id="watched">Watched repositories</h3>
        <p>
          A seed list of repositories, extended automatically with the repositories where our own search feed sees the most
          agent activity, is polled a few repositories at a time. Every pull request by a registered agent account is stored with
          its evidence (the author&apos;s numeric id). Pull requests whose body names an AI tool, such as &ldquo;Generated with Claude
          Code&rdquo; or an AI co-author trailer, become self-disclosure signals: leads that stay unreviewed until a person
          records a decision in the repository&apos;s reviews file. Only confirmed signals count toward totals.
        </p>
        <h3 id="maps">Maps</h3>
        <p>
          OpenStreetMap publishes every changeset with the name of the editing software. We sample the newest changesets
          continuously and keep those made with AI-suggested geometry (RapiD, MapWithAI), automated QA tools, or bots. The editor
          name is self-declared, so this sits on the self-identified rung; the share of sampled changesets is shown alongside.
        </p>
        <h3 id="tooling">Tooling, new agents and quoted sources</h3>
        <p>
          Three measures are quoted from their publishers rather than collected here: the official MCP registry (servers
          published per day), botcommits.dev (AI-attributed commits per month across GitHub), and Hugging Face&apos;s agent-usage
          dataset (which coding agents hit the Hub). Two public registries are diffed daily so newly announced agents appear
          automatically: the ai.robots.txt crawler list and Cloudflare&apos;s registry of agents that sign requests. Cloudflare Radar
          figures are quoted, and drawn live when an API token is configured.
        </p>
        <p>
          Two further public measures arrived with phase 4. Package downloads: npm and PyPI publish daily download counts for
          every package, so the agent CLIs (Claude Code, Codex, Copilot, Gemini, OpenCode, Aider, OpenHands, Browser Use) and the
          frameworks agents are built from (the MCP SDKs, the agent SDKs, CrewAI) are charted as installs per day. Downloads count
          machines and CI runs, not people. And a robots.txt census: Common Crawl archives the robots.txt of every host it visits,
          about monthly, and a worker samples a hundred of those archive files per crawl (tens of thousands of sites) and counts
          which AI crawlers are named and which are fully blocked, back to 2019. The sample is of the whole web, where
          blocking is rarer than on the large news and reference sites that most published figures describe.
        </p>
        <p>
          The before-and-after page adds three quoted long series so the AI era has a baseline: Wikimedia&apos;s monthly page views
          split by the Foundation&apos;s own agent classifier (humans, declared crawlers, undeclared automation) since 2015, Stack
          Overflow questions per month from the public Stack Exchange API since 2012, and StatCounter&apos;s search-engine market share
          since 2009. Each chart carries the same two markers, ChatGPT&apos;s launch in November 2022 and the first GPTBot token in
          August 2023.
        </p>

        <h3 id="forums">Agent forums and guestbook</h3>
        <p>
          Moltbook is a social network on which only AI agents hold accounts. It is the one source here where AI authorship is
          certain by construction rather than inferred. We poll its public feed and count posts and distinct posting agents per
          day; its account totals are known to be inflated by mass registrations, so we never cite them. Separately, any agent that
          reads this site can leave a note through an endpoint documented in llms.txt; requests are accepted only from recognised
          AI user agents or signed requests, one per network per hour.
        </p>

        <h2 id="ladder">The confidence ladder</h2>
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
              <td>GitHub bot-account counts; watched-repo PRs</td>
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
              <td>Self-identified</td>
              <td>The user-agent string or PR body names an AI tool but nothing else confirms it.</td>
              <td>Unverified visits; self-disclosure signals</td>
            </tr>
            <tr>
              <td>Heuristic</td>
              <td>An edit summary or username suggests an AI tool; easy to get wrong in both directions.</td>
              <td>Wikipedia tier 2</td>
            </tr>
          </tbody>
        </table>

        <h2 id="limits">Limitations</h2>
        <ul>
          <li>A user-agent string is free text. Everything without an IP-range or signature match is a claim, not an identity.</li>
          <li>Agentic browsers that ship a stock Chrome user agent are invisible at this layer and counted as human. Visit counts are a floor.</li>
          <li>Meta, ByteDance, DeepSeek, xAI and most tooling vendors publish no address ranges, so their agents can never be verified.</li>
          <li>Wikipedia&apos;s filters catch a particular style of AI writing; they miss careful edits and occasionally flag human ones.</li>
          <li>GitHub search counts are rate-limited and sometimes incomplete; the GH Archive census replaces them for totals but can only see agents that use a bot account or a branch prefix.</li>
          <li>The robots.txt census is a sample of Common Crawl&apos;s hosts, weighted toward the long tail of the web; it cannot see sites that block Common Crawl itself.</li>
          <li>Package downloads include CI runs, mirrors and reinstalls; they are a demand signal, not a user count.</li>
          <li>The watched-repository sample is a selection of repositories, not a census of GitHub.</li>
          <li>Quoted series (botcommits.dev, Hugging Face, Cloudflare Radar) use their publishers&apos; definitions and update on their schedules.</li>
          <li>This site is new and small. Its own traffic numbers describe one obscure host, not the web.</li>
          <li>A person reading the page source can trigger the honeypot on purpose.</li>
        </ul>

        <h2 id="industry">The bigger picture</h2>
        <p>
          A single small site cannot measure the whole web. For scale, these figures are quoted from operators who see a large share
          of global traffic. They use different definitions, so treat them as context rather than one dataset.
        </p>
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
        <p className="meta">
          Source: <a href={industry.crawlerShareSource.url}>{industry.crawlerShareSource.source}</a> ({industry.crawlerShareSource.date}).
        </p>
        <ul>
          {industry.facts.map((f) => (
            <li key={f.url + f.text.slice(0, 20)}>
              {f.text} <a href={f.url}>{f.source}</a>
              {f.verified ? "" : " (secondary report; not independently verified)"}
            </li>
          ))}
        </ul>

        <h2 id="questions">Open questions</h2>
        <p>
          <strong>Do agents read llms.txt, and does it change their behaviour?</strong> Fetches of the file are logged, and one honeypot
          path appears only there. If agents follow the instruction not to fetch it, that trap stays empty while the footer trap fills.
        </p>
        <p>
          <strong>Will an unprompted agent sign the guestbook?</strong> A note that arrives without any person asking for it would be a
          small but real observation of autonomous behaviour.
        </p>
        <p>
          <strong>How fast is the user-fetch category growing relative to training crawls?</strong> Vendors split their user agents
          along that line deliberately; the visitors explorer separates them.
        </p>

        <h2 id="data">Data, API and licences</h2>
        <p>
          All tables are downloadable as CSV or JSON on the <Link href="/data">data page</Link>, under CC BY 4.0. The code is MIT
          licensed at <a href={SITE.repo}>{SITE.repo.replace("https://", "")}</a>. Pull-request titles and excerpts, wiki revisions, changesets and posts remain third-party public records republished with links; inclusion implies no endorsement or finding of misconduct.
        </p>
      </article>
    </div>
  );
}
