"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { SOCIAL_PLATFORMS } from "@/lib/social-contract";
import { sampleValue, type SocialMetric, type SocialReportData } from "@/lib/social-report";
import { fmtStamp } from "@/lib/format";
import { FigureHead } from "./ui";

const LABELS = { bluesky: "Bluesky", mastodon: "Mastodon" };
const observationTime = (value: string) => new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false, timeZone:"UTC" }).format(new Date(value)) + " UTC";
export function SocialReport({ data }: { data: SocialReportData }) {
  const id = useId();
  const [metric, setMetric] = useState<SocialMetric>("disclosures");
  const [selected, setSelected] = useState("bluesky:" + data.days.at(-1));
  const byKey = new Map(data.samples.map(s => [s.platform + ":" + s.day, s]));
  const observation = byKey.get(selected);
  const max = metric === "sample" ? 300 : 20;
  return <section id="ai-publishing" className="overview-report" aria-labelledby={id + "-heading"}>
    <FigureHead id={id + "-heading"} title="AI publishing · social signals"
      sub="Short Bluesky observations and public Mastodon timeline samples, collected once per UTC day."
      more={{href:"/social", label:"Coverage and methods →"}} />
    {data.mode === "demo" ? <p className="demo-notice">Synthetic social samples for this preview.</p> : null}
    {data.mode === "offline" || data.mode === "unavailable" ? <p className="empty">Social observations are {data.mode === "offline" ? "offline" : "unavailable"}. The heatmap marks missing samples, not zero activity.</p> : null}
    <div className="heatmap-controls">
      <label htmlFor={id + "-metric"}>Show <select id={id + "-metric"} value={metric} onChange={e => setMetric(e.target.value as SocialMetric)}>
        <option value="disclosures">AI disclosure text matches (%)</option>
        <option value="automation">Self-designated bot accounts (%)</option>
        <option value="sample">Posts sampled</option>
      </select></label>
      <span>{data.days[0]} – {data.days.at(-1)} · UTC sample dates</span>
    </div>
    <div className="social-map-scroll" role="region" aria-label="Social sample heatmap; scroll horizontally on small screens" tabIndex={0}>
      <div className="social-map">
        {SOCIAL_PLATFORMS.map(platform => <div className="social-map-row" key={platform}>
          <strong>{LABELS[platform]}</strong>
          {data.days.map((day, index) => {
            const key = platform + ":" + day, s = byKey.get(key), v = sampleValue(s, metric);
            const label = LABELS[platform] + " · " + day + ": " + (v === null ? s && metric === "automation" && platform === "bluesky" ? "bot status not measured" : "no comparable observation" :
              metric === "sample" ? v + " posts sampled" : v.toFixed(2) + "% of " + s!.sampledPosts + " sampled posts") + (s?.outcome === "partial" ? "; partial sample" : "");
            return <button key={day} type="button" className={"social-cell" + (v === null ? " missing" : "") + (s?.outcome === "partial" ? " partial" : "")}
              style={v === null ? undefined : { backgroundColor: "color-mix(in srgb, var(--accent) " + (12 + 88 * Math.min(1,v/max)) + "%, var(--bg))" }}
              title={label} aria-label={label} aria-pressed={selected === key}
              onClick={() => setSelected(key)}
              onKeyDown={event => {
                let next = index;
                if (event.key === "ArrowRight") next = Math.min(data.days.length - 1,index + 1);
                else if (event.key === "ArrowLeft") next = Math.max(0,index - 1);
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = data.days.length - 1;
                else return;
                event.preventDefault();
                const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
                buttons?.[next]?.focus(); setSelected(platform + ":" + data.days[next]);
              }} />
          })}
        </div>)}
      </div>
    </div>
    <div className="heatmap-legend"><span><i className="heat-key zero" />Observed zero</span><span><i className="heat-key missing" />Missing / not measured</span>
      <span><i className="heat-key partial" />Partial sample</span><span><i className="heat-ramp" />0 – {metric === "sample" ? "300 posts" : "20%+"}</span></div>
    <div className="social-inspector" aria-live="polite">
      <strong>{selected.replace(":", " · ")}</strong>
      {observation ? <>
        <p>{observation.sampledPosts} original public posts sampled · {observation.aiDisclosurePosts} English AI disclosure text matches
          {observation.platform === "mastodon" ? " · " + observation.automatedAccountPosts + " posts from self-designated bot accounts" : " · account bot status not measured"}.
          {observation.outcome === "partial" ? " Partial collection." : " Bounded sample completed."}</p>
        <p>Observed {observationTime(observation.startedAt)} – {observationTime(observation.finishedAt)}.
          {observation.coverage.publisherFrom && observation.coverage.publisherTo ? " Source event/post timestamps: " + fmtStamp(observation.coverage.publisherFrom) + " – " + fmtStamp(observation.coverage.publisherTo) + "." : ""}</p>
        <p>Scope: {observation.scopes.map(s => new URL(s).host).join(", ")}.
          {observation.coverage.scopes.some(s => s.outcome === "failed") ? " One or more configured sources were unavailable." : ""}
          {" "}Cap: {observation.coverage.maxRecords} records / {observation.coverage.maxRequests} request{observation.coverage.maxRequests === 1 ? "" : "s"}.
          {" "}Method v{observation.collectionVersion}.</p>
      </> : <p>No sample is available for this date. This does not mean no AI activity occurred.</p>}
    </div>
    <p className="report-source">These are selected observations, not daily platform totals or estimates of AI prevalence.
      Text matches are unverified disclosures; they can be false or quoted. Bot flags include ordinary automation.
      The two signals may overlap and must not be added. Replies and boosts are excluded.</p>
    <p className="report-source"><Link href="/traffic">AI reading</Link> uses separate network measurements. Social posts cannot reveal who scraped them.</p>
  </section>;
}
