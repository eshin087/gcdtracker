"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { fmtStamp } from "@/lib/format";
import { destinationCounts, flowWeight, formatFlowValue, type FlowData } from "@/lib/flow";
import type { LatestRecord } from "@/lib/stats-sources";

const MQ = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MQ); mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getMotion() { return window.matchMedia(MQ).matches; }

/** The original moving source-to-destination paths, with honest comparison scales. */
export function AgentFlow({ data, records, showReplay = true }: { data: FlowData; records: LatestRecord[]; showReplay?: boolean }) {
  const id = useId().replace(/:/g, "");
  const [destination, setDestination] = useState("all");
  const [selection, setSelection] = useState("");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
  const links = useMemo(() => data.links.filter(l => destination === "all" || l.target === destination), [data.links, destination]);
  const sources = useMemo(() => data.sources.filter(s => links.some(l => l.source === s.id)), [data.sources, links]);
  const targets = data.targets.filter(t => destination === "all" || t.id === destination);
  const selected = sources.find(s => s.id === selection) ?? sources[0];
  const feed = data.feeds.find(f => f.key === selected?.feed);
  const W = 900, left = 260, right = 655;
  const H = Math.max(270, 68 + Math.max(sources.length, targets.length) * 40);
  const sourceY = (key: string) => 42 + ((H - 62) / Math.max(1, sources.length)) * (sources.findIndex(s => s.id === key) + 0.5);
  const targetY = (key: string) => 42 + ((H - 62) / targets.length) * (targets.findIndex(t => t.id === key) + 0.5);
  const path = (source: string, target: string) => {
    const mid = (left + right) / 2;
    return `M${left},${sourceY(source)} C${mid},${sourceY(source)} ${mid},${targetY(target)} ${right},${targetY(target)}`;
  };
  useEffect(() => {
    if (paused || reduced || records.length < 2) return;
    const timer = setInterval(() => setIdx(i => (i + 1) % records.length), 4000);
    return () => clearInterval(timer);
  }, [paused, reduced, records.length]);
  const currentIndex = records.length ? idx % records.length : 0;
  const current = records[currentIndex];
  const status = !feed || feed.outcome === "unknown" ? "Collection status unavailable" :
    (feed.stale ? "Stale · " : "") + feed.outcome;
  return (
    <div className="flow" data-mode={data.mode}>
      <div className="flow-toolbar">
        <div className="flow-window"><span className={"badge" + (data.mode === "demo" ? " warn" : "")}>{data.mode === "demo" ? "Demo · synthetic data" : data.mode === "offline" ? "Sources unavailable" : "Recorded observations"}</span><span>{data.windowLabel ?? `${data.days} completed UTC days · ${data.windowStart} → ${data.windowEnd} (exclusive)`}</span></div>
        <div className="flow-filters" role="group" aria-label="Filter destinations">
          <button type="button" aria-pressed={destination === "all"} onClick={() => setDestination("all")}>All destinations</button>
          {data.targets.map(t => <button key={t.id} type="button" aria-pressed={destination === t.id} onClick={() => setDestination(t.id)}>{t.label}</button>)}
        </div>
      </div>
      <div className="chart-scroll flow-scroll" tabIndex={0} role="region" aria-label="Agents to destinations; scroll horizontally on small screens">
        <svg className="chart flow-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agents and observed activity connected to their destinations">
          <text x={left - 12} y={20} textAnchor="end" className="flow-heading">{data.sourceHeading ?? "AGENTS & OBSERVED ACTIVITY"}</text>
          <text x={right + 14} y={20} className="flow-heading">{data.targetHeading ?? "DESTINATIONS"}</text>
          <defs>{links.map((link, i) => <path key={link.source} id={`${id}-flow-path-${i}`} d={path(link.source, link.target)} />)}</defs>
          {links.map((link, i) => {
            const source = sources.find(s => s.id === link.source)!;
            const weight = flowWeight(source, data.sources);
            const dots = link.value > 0 ? Math.max(1, Math.ceil(weight * 5)) : 0;
            const duration = 5 + (1 - weight) * 4;
            return <g key={link.source} className={selected?.id === link.source ? "flow-selected" : undefined}>
              <path className="flow-link" d={path(link.source, link.target)} strokeWidth={1.5 + Math.sqrt(weight) * 12} strokeDasharray={link.value === 0 ? "3 5" : undefined} onClick={() => setSelection(link.source)}>
                <title>{`${source.label} → ${targets.find(t => t.id === link.target)?.label}: ${formatFlowValue(link.value, source.unit)}. ${source.evidence}. Independent ${source.feed}/${source.unit} scale.`}</title>
              </path>
              {!reduced && !paused ? Array.from({length:dots}, (_, k) => <circle key={k} className="flow-dot" r={2.6}><animateMotion dur={`${duration}s`} begin={`${k * duration / dots}s`} repeatCount="indefinite"><mpath href={`#${id}-flow-path-${i}`} /></animateMotion></circle>) : null}
            </g>;
          })}
          {sources.map(source => <g key={source.id} className={"flow-node" + (source.id === selected?.id ? " is-selected" : "")} onClick={() => setSelection(source.id)}>
            <title>{`${source.label}: ${formatFlowValue(source.total, source.unit)}; ${source.evidence}`}</title>
            <circle cx={left} cy={sourceY(source.id)} r={4} />
            <text x={left - 12} y={sourceY(source.id) + 2} textAnchor="end" className="flow-label">{source.label}</text>
            <text x={left - 12} y={sourceY(source.id) + 17} textAnchor="end" className="flow-count">{formatFlowValue(source.total, source.unit)}</text>
          </g>)}
          {targets.map(target => <g key={target.id} className="flow-node">
            <rect x={right} y={targetY(target.id) - 12} width={6} height={28} rx={1} className="flow-target" />
            <text x={right + 14} y={targetY(target.id) + 1} className="flow-label">{target.label}</text>
            <text x={right + 14} y={targetY(target.id) + 17} className="flow-count">{destinationCounts(target.id, data)}</text>
          </g>)}
        </svg>
      </div>
      {!links.length ? <p className="empty">{data.emptyMessage ?? "No observations available in this window."}</p> : null}
      <p className="flow-scale-note">{data.scaleNote ?? "Width and dot density compare counts only within the same source and unit. Each source uses its own scale. PR matches may overlap; edits and files stay separate. Animation illustrates recorded activity, not live event timing. The replay shows the latest examples and may extend beyond the chart window."}</p>
      {selected ? <section className="flow-inspector" aria-label="Source evidence and coverage">
        <div className="flow-picker"><label htmlFor={id + "-source"}>Inspect source</label><select id={id + "-source"} value={selected.id} onChange={e => setSelection(e.target.value)}>{sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <dl className="flow-metadata">
          <div><dt>Observed value</dt><dd>{formatFlowValue(selected.total, selected.unit)}</dd></div>
          <div><dt>Destination</dt><dd>{links.filter(link => link.source === selected.id).map(link => targets.find(target => target.id === link.target)?.label).filter(Boolean).join(", ")}</dd></div>
          <div><dt>Purpose / context</dt><dd>{selected.purpose}</dd></div>
          <div><dt>Attribution evidence</dt><dd>{selected.evidence}</dd></div>
          <div><dt>{selected.coverageLabel ? "Coverage" : "Observed dates"}</dt><dd>{selected.coverageLabel ?? `${selected.observedDays}/${data.days} UTC dates contain rows`}</dd></div>
          <div><dt>{feed?.outcomeLabel ?? "Collection status"}</dt><dd className="flow-status">{status}</dd></div>
          <div><dt>Latest observation</dt><dd>{selected.latestObservation ? fmtStamp(selected.latestObservation) : "Unavailable"}</dd></div>
          <div><dt>{feed?.lastRunLabel ?? "Last collection run"}</dt><dd>{feed?.lastRun ? fmtStamp(feed.lastRun) : "Not available; no uptime inferred"}</dd></div>
          {selected.details?.filter(detail => detail.label === "Account bot flags").map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
        </dl>
        {selected.details?.length ? <details className="flow-details"><summary>Sampling and source details</summary><dl className="flow-metadata">{selected.details.filter(detail => detail.label !== "Account bot flags").map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl></details> : null}
        <p>{selected.method} Dates with rows do not establish complete collection or continuous uptime. <a href={selected.href}>Explore source evidence →</a></p>
      </section> : <p className="flow-scale-note">Explore the public source pages, or <a href="/demo">open the labelled dashboard demo</a>.</p>}
      <div className="flow-ticker" aria-live={paused || reduced ? "polite" : "off"}>
        {showReplay && current ? <><span className="label">Replaying {currentIndex + 1}/{records.length}</span><span className="flow-ticker-text"><strong>{current.actor}</strong> {current.action} {current.url ? <a href={current.url}>{current.target}</a> : current.target}<span className="dim"> · {fmtStamp(current.ts)}</span></span></> : <span className="dim">{showReplay ? "No recorded examples available." : "Animation illustrates the summary; dots are not individual live events."}</span>}
        <span className="flow-ticker-controls">
          <button type="button" disabled={reduced} aria-pressed={paused || reduced} title={reduced ? "Automatic playback is off because reduced motion is enabled" : undefined} onClick={() => setPaused(p => !p)}>{reduced ? "Motion off" : paused ? "Play" : "Pause"}</button>
          {showReplay && current ? <button type="button" onClick={() => setIdx(i => (i + 1) % records.length)}>Next</button> : null}
        </span>
      </div>
    </div>
  );
}
