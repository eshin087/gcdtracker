import type { Metadata } from "next";
import Link from "next/link";
import { Rail, type RailItem } from "@/components/Rail";
import industry from "../../../data/industry.json";
import { CATALOG, IP_SOURCES } from "@/lib/agents/catalog";
import { GITHUB_AGENTS } from "@/lib/github/agents";
import { OBSERVATORY } from "@/lib/ingest/observatory";
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
  { id: "observatory", title: "Watched repositories", level: 3 },
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
          Wikipedia recent-changes API, the GitHub search API, Moltbook&apos;s public feed and the observatory snapshot every 30
          minutes; published IP lists are refreshed daily. Raw rows are kept for AI and honeypot visits only; people are counted,
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

        <h3 id="observatory">Watched repositories</h3>
        <p>
          A second, separately built site, the <a href={OBSERVATORY.site}>{OBSERVATORY.name}</a>, records every documented agent
          pull request in a small watch-list of repositories (github/gh-aw, airbytehq/airbyte, fern-api/docs, OpenHands/OpenHands)
          and scans PR bodies for self-disclosure lines such as &ldquo;Generated with Claude Code&rdquo;. It publishes a daily
          snapshot; we mirror it into our database so history survives its 90-day window and show it on the GitHub tab as watched
          repositories and self-disclosure signals. Its coverage is a selected sample, not a census, and self-disclosure hits are
          candidates until reviewed.
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
          <li>GitHub counts come from the public search API, which is rate-limited and sometimes marks results as incomplete.</li>
          <li>The watched-repository sample covers four repositories and four agents; it is evidence, not a census.</li>
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
          licensed at <a href={SITE.repo}>{SITE.repo.replace("https://", "")}</a>. Watched-repository records are mirrored from the
          observatory under its MIT licence; PR titles and excerpts remain third-party metadata, and inclusion implies no endorsement
          or finding of misconduct.
        </p>
      </article>
    </div>
  );
}
