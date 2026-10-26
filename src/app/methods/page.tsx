import type { Metadata } from "next";
import Link from "next/link";
import { Rail, type RailItem } from "@/components/Rail";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Methods", description: "What gcdTracker measures, how attribution works, and the limits of each source." };
const RAIL: RailItem[] = [{ id: "traffic", title: "Published traffic" }, { id: "sources", title: "Research sources" }, { id: "ladder", title: "Evidence labels" }, { id: "limits", title: "Coverage and missing data" }, { id: "data", title: "Data and privacy" }];

export default function MethodsPage() {
  return <div className="shell with-rail"><Rail items={RAIL} /><article className="article prose">
    <h1>Methods</h1>
    <p className="lede">Separate observed requests, attribution claims and published context. No single source here measures all AI activity on the internet.</p>
    <h2 id="traffic">Published traffic</h2>
    <p>Cloudflare Radar reports traffic observed on its network. Wikimedia publishes pageviews classified as user, spider and automated traffic. Neither source is a representative total of the whole internet, and automated traffic is not necessarily AI traffic.</p>
    <p>Radar values retain their published units, normalization and observation windows. A normalized index is not a count of requests. Complete window snapshots are compared internally; incompatible rolling scales are not stitched into one trend.</p>
    <p>The agent directory documents vendor-declared crawler purposes and identity mechanisms. It does not measure visits to gcdTracker. Website request collection and local visitor dashboards have been retired; stored historical records are preserved.</p>
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
    <p>The ai.robots.txt history dates when crawler tokens appeared in that maintained list, not necessarily when crawlers launched. Signing-registry entries advertise keys; registry inclusion does not establish observed usage.</p>
    <h3 id="robots">Crawler blocking and broader traffic</h3>
    <p>The robots.txt sample comes from Common Crawl archive files with readable rules. Results apply to sampled hosts, not the whole web; sites inaccessible to Common Crawl are underrepresented. Cloudflare Radar describes traffic visible to Cloudflare, and historical quotations are dated separately from refreshed series.</p>
    <h3 id="social">Social publishing</h3>
    <p>Bluesky contributes a short live Jetstream sample; Mastodon contributes local public timeline snapshots from two configured servers. Original public posts are counted, excluding replies and boosts. English first-person AI disclosure text matches are unverified signals, and Mastodon bot flags indicate self-designated automation, not necessarily AI. The signals can overlap. Bluesky account bot status is not measured.</p>
    <p>Each UTC date labels the sampling attempt, not an entire day of activity. Timing, language and server selection bias the sample; Mastodon pages can overlap across dates. Counts must not be extrapolated to platform totals or combined into a unique-post total. Only aggregates and coverage metadata are retained. See <Link href="/social">social samples</Link>.</p>
    <h3 id="forums">Forums</h3>
    <p>Moltbook describes its platform as intended for agents. We count platform-reported public posts and account identities; we cannot independently establish AI authorship.</p>
    <h2 id="ladder">Evidence labels</h2>
    <table><thead><tr><th>Label</th><th>What it establishes</th></tr></thead><tbody>
      <tr><td>Bot account</td><td>An observed GitHub account matches a configured agent account.</td></tr>
      <tr><td>Filter-flagged</td><td>A publisher&apos;s filter marked a record; false positives remain possible.</td></tr>
      <tr><td>Self-declared or heuristic</td><td>A name, token, branch or text pattern suggests AI activity without independently proving it.</td></tr>
      <tr><td>Platform-reported</td><td>A publisher supplied the classification or count; its population and definitions apply.</td></tr>
    </tbody></table>
    <h2 id="limits">Coverage and missing data</h2>
    <p>Collection is scheduled, can be delayed and can fail. A successful run is not proof of complete historical coverage. The <Link href="/data">data page</Link> reports source status. Current days and months are incomplete; absent data must not be interpreted as zero activity. Retention limits mean stored raw records are not all-time totals.</p>
    <p>Long-term charts put AI launch dates beside observed trends. Timing alone does not establish cause: platform changes, measurement revisions, seasonality and unrelated behavior can contribute. Counts of requests, edits, PRs, posts and downloads cannot be added into a total for autonomous AI work.</p>
    <h2 id="data">Data and privacy</h2>
    <p>Only external public sources feed the dashboards. Source classifications, attribution limitations and observation windows are retained in the displayed evidence.</p>
    <p>Download public data and see endpoint details on the <Link href="/data">data page</Link>. Original collected datasets use CC BY 4.0; republished third-party records and quoted series retain their source licences. Inclusion of a contribution does not establish misconduct. The code is available at <a href={SITE.repo}>{SITE.repo.replace("https://", "")}</a>.</p>
  </article></div>;
}
