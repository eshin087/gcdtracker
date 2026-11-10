import type { Metadata } from "next";
import { AgentFlow } from "@/components/AgentFlow";
import { socialFlow } from "@/lib/flow-observatory";
import { Rail } from "@/components/Rail";
import { getSocialReport } from "@/lib/stats-social";
import { SOCIAL_SOURCE_DOCS } from "@/lib/social-contract";
import { pooledDisclosure } from "@/lib/social-report";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";

const PLATFORM_NAMES = { bluesky: "Bluesky", mastodon: "Mastodon" } as const;

export const revalidate = 300;
export const metadata: Metadata = { title: "Social publishing", description: "Bounded public Bluesky and Mastodon samples, AI disclosure signals, automation and explicit coverage limits." };
const sections = [{id:"ai-publishing", title:"Publishing flow"}, {id:"social-coverage", title:"What is observed"}];
export default async function SocialPage() {
  const data = await getSocialReport();
  const pooled = pooledDisclosure(data.samples);
  return <div className="shell with-rail"><Rail items={sections}/><article className="overview-content">
    <h1>Social publishing</h1>
    <p className="page-sub">Observable public posting activity, with AI disclosure signals and ordinary automation kept distinct.</p>
    <section id="ai-publishing" className="overview-report" aria-label="Social publishing flow">
      <p className="report-source">Each platform shows its latest bounded sample. Disclosure matches and remaining posts partition that sample; account bot flags appear separately in the inspector because the signals can overlap.</p>
      <AgentFlow data={socialFlow(data)} records={[]} showReplay={false}/>
      {pooled.length ? <>
        <h2>All stored samples together</h2>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Platform</th><th className="num">Disclosure matches</th><th className="num">Sampled posts</th><th className="num">Rate</th><th>Sample dates</th></tr></thead><tbody>
          {pooled.map(p => <tr key={p.platform}>
            <td>{PLATFORM_NAMES[p.platform]}</td>
            <td className="num">{fmtInt(p.aiDisclosurePosts)}</td>
            <td className="num">{fmtInt(p.sampledPosts)}</td>
            <td className="num" style={{ whiteSpace: "nowrap" }}>{p.sampledPosts > 0 ? fmtPct(p.aiDisclosurePosts / p.sampledPosts) : "–"}</td>
            <td className="dim">{fmtInt(p.sampleDays)} of the last {fmtInt(data.days.length)} UTC dates · {fmtDay(p.firstDay)} – {fmtDay(p.lastDay)}</td>
          </tr>)}
        </tbody></table></div>
        <p className="report-source">One day&apos;s sample is small, so a daily zero says little. This adds up every stored sample; dates without a sample are left out, not counted as zero. Matches are unverified English text signals, and Mastodon snapshots can repeat posts between days, so its total is not a count of unique posts.</p>
      </> : null}
    </section>
    <section id="social-coverage" className="overview-report">
      <h2>What is observed</h2>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Source</th><th>Sample</th><th>Limits</th></tr></thead><tbody>
        <tr><td><a href={SOCIAL_SOURCE_DOCS.bluesky}>Bluesky / Jetstream</a></td><td>One short live stream of new original public posts per UTC day.</td><td>At most 8 seconds, 300 frames and a 256 KiB decoded processing budget. No requested replay, profile lookup or inference about account bot status. Relay creates can include resynchronized records; these are not a count of newly authored posts.</td></tr>
        <tr><td><a href={SOCIAL_SOURCE_DOCS.mastodon}>Mastodon</a></td><td>One local public timeline page each from mastodon.world and fosstodon.org.</td><td>At most 40 entries per server. Other servers, private content and inaccessible timelines are outside coverage.</td></tr>
      </tbody></table></div>
      <p className="report-source">Timing, English disclosure matching, server selection (including a technology-focused community) and filtering bias this sample. A successful run means the bounded procedure completed; it does not mean full-day or full-platform coverage. Mastodon snapshots can overlap across days, so summing them does not yield unique posts.</p>
      <p className="report-source">Decoded byte limits bound processing; network overhead and the final frame or chunk can exceed that budget. Only aggregate counts, windows and sampling metadata are retained. No post bodies, media, user identifiers or model-attribution guesses are saved. A zero means zero matches in that sample, not zero AI authorship.</p>
      <p className="report-source"><a href="/api/export/social_samples.json">Download the last 28 UTC sample dates (JSON)</a> · <a href="/data">Collection status</a> · <a href="/methods">All methodology</a></p>
    </section>
  </article></div>;
}
