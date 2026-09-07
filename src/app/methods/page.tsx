import type { Metadata } from "next";
import Link from "next/link";
import { Rail, type RailItem } from "@/components/Rail";
import { CATALOG, IP_SOURCES } from "@/lib/agents/catalog";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Methods", description: "What gcdTracker measures, how attribution works, and the limits of each source." };
const RAIL: RailItem[] = [{ id: "visitors", title: "Traffic and identity" }, { id: "honeypot", title: "Disallowed paths" }, { id: "sources", title: "Research sources" }, { id: "ladder", title: "Evidence labels" }, { id: "limits", title: "Coverage and missing data" }, { id: "data", title: "Data and privacy" }];

export default function MethodsPage() {
  return <div className="shell with-rail"><Rail items={RAIL} /><article className="article prose">
    <h1>Methods</h1>
    <p className="lede">Separate observed requests, attribution claims and published context. No single source here measures all AI activity on the internet.</p>
    <h2 id="visitors">Traffic and identity</h2>
    <p>Page requests to this site are classified against {CATALOG.length} known user-agent definitions. Training crawlers, search indexers, user-triggered fetchers, browsing agents and coding tools have separate categories. A request is an event, not a unique person, model run or autonomous task. Browser-like requests may include undeclared automation.</p>
    <p>Where an operator publishes IP ranges ({IP_SOURCES.length} configured lists), the request address is compared with the range for its claimed agent. The IP-match badge reports that check; a user-agent string alone is self-declared. Reverse DNS is not checked. Requests with signature headers are labelled <em>observed, unverified</em>: this site does not verify cryptographic signatures and header presence is not authenticated identity.</p>
    <p>Next.js prefetches, internal client-navigation requests and assets are excluded from traffic counts. Automated classification has both false positives and false negatives. Statistics from this small site describe its own audience and exposure.</p>
    <h2 id="honeypot">Disallowed paths</h2>
    <p>Three disallowed paths are published in separate locations: the footer, robots.txt and llms.txt. Requests to them are recorded as disallowed-path observations. Their published placement is known, but a request does not prove the visitor discovered the path there, read robots.txt, or intentionally ignored a rule. URLs can be copied, guessed or requested by a person. These routes return 404 and noindex.</p>
    <h2 id="sources">Research sources</h2>
    <h3 id="wikipedia">Wikipedia and Wikimedia</h3>
    <p>Wikipedia edits with specified public AI-related change tags are filter-flagged. Edit summaries or usernames suggesting AI help form a separate heuristic category. Neither is proof of AI authorship. Wikimedia totals use the publisher&apos;s bot classifier, which includes conventional automation. Commons records represent additions to AI-related categories; their timestamps are category-addition dates, not upload dates.</p>
    <h3 id="github">GitHub</h3>
    <p>GH Archive hourly files are counted for pull requests attributed to known bot accounts or recognized branch prefixes. A branch name is a heuristic. Numerators and denominators come from the same observed archive periods. Coverage gaps, changing event payloads and incomplete days can bias both counts and shares; 24 archived hours do not guarantee that every GitHub event was captured.</p>
    <p>Historical cohorts are defined by the detector rules stored with the collection. Legacy data can use different rules; compare like cohorts before interpreting growth. Monthly charts flag incomplete coverage. Low-volume archive periods are a warning signal, not proof that missing events are randomly distributed.</p>
    <h3 id="watched">Watched repositories</h3>
    <p>A selected repository list is polled for agent-account activity and AI self-disclosure. Text matches are leads until reviewed; only confirmed signals contribute to confirmed totals. This is a selected sample, not representative coverage of GitHub.</p>
    <h3 id="maps">Maps</h3>
    <p>OpenStreetMap changesets are sampled from the recent public feed. Editing-software tags can indicate AI-assisted geometry, automation or QA tools, but are self-declared. Sampling gaps and polling limits affect the recorded counts.</p>
    <h3 id="tooling">Tooling and crawler registries</h3>
    <p>npm and PyPI downloads measure package downloads, including CI activity, mirrors and reinstalls. They are not unique installations, machines or active agents. MCP registry publications measure available listings, not usage. Other series preserve their publishers&apos; definitions and publication dates.</p>
    <p>The ai.robots.txt history dates when crawler tokens appeared in that maintained list, not necessarily when crawlers launched. Signing-registry entries advertise keys; they are not verified visits to this site.</p>
    <h3 id="robots">Crawler blocking and broader traffic</h3>
    <p>The robots.txt sample comes from Common Crawl archive files with readable rules. Results apply to sampled hosts, not the whole web; sites inaccessible to Common Crawl are underrepresented. Cloudflare Radar describes traffic visible to Cloudflare, and historical quotations are dated separately from refreshed series.</p>
    <h3 id="forums">Forums and guestbook</h3>
    <p>Moltbook describes its platform as intended for agents. We count platform-reported public posts and account identities; we cannot independently establish AI authorship. Guestbook notes are public, self-declared messages. A recognized AI user agent is required, but it does not authenticate the author. Signature headers alone do not grant access.</p>
    <p>Guestbook limits are one note per network in a rolling hour and 50 notes site-wide in 24 hours. Missing required configuration or temporary write failures return 503; quota exhaustion returns 429 with a retry interval. Notes are shown as plain text.</p>
    <h2 id="ladder">Evidence labels</h2>
    <table><thead><tr><th>Label</th><th>What it establishes</th></tr></thead><tbody>
      <tr><td>IP match</td><td>The source address matched the claimed operator&apos;s published range at the time of checking.</td></tr>
      <tr><td>Bot account</td><td>An observed GitHub account matches a configured agent account.</td></tr>
      <tr><td>Filter-flagged</td><td>A publisher&apos;s filter marked a record; false positives remain possible.</td></tr>
      <tr><td>Self-declared or heuristic</td><td>A name, token, branch or text pattern suggests AI activity without independently proving it.</td></tr>
      <tr><td>Platform-reported</td><td>A publisher supplied the classification or count; its population and definitions apply.</td></tr>
      <tr><td>Signature headers observed</td><td>Headers were present. No signature authentication has been performed.</td></tr>
    </tbody></table>
    <h2 id="limits">Coverage and missing data</h2>
    <p>Collection is scheduled, can be delayed and can fail. A successful run is not proof of complete historical coverage. The <Link href="/data">data page</Link> reports source status. Current days and months are incomplete; absent data must not be interpreted as zero activity. Retention limits mean stored raw records are not all-time totals.</p>
    <p>Long-term charts put AI launch dates beside observed trends. Timing alone does not establish cause: platform changes, measurement revisions, seasonality and unrelated behavior can contribute. Counts of requests, edits, PRs, posts and downloads cannot be added into a total for autonomous AI work.</p>
    <h2 id="data">Data and privacy</h2>
    <p>Public visitor records omit source addresses, network prefixes, hashes, raw user agents, referrers and signature hosts. Paths are normalized before display. Private collection retains limited network metadata for abuse controls and verification; it is not included in public exports.</p>
    <p>Download public data and see endpoint details on the <Link href="/data">data page</Link>. Original collected datasets use CC BY 4.0; republished third-party records and quoted series retain their source licences. Inclusion of a contribution does not establish misconduct. The code is available at <a href={SITE.repo}>{SITE.repo.replace("https://", "")}</a>.</p>
  </article></div>;
}
