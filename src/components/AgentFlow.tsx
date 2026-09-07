"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { fmtInt, fmtStamp } from "@/lib/format";
import type { FlowData, LatestRecord } from "@/lib/stats-sources";

const MQ = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getMotion() { return window.matchMedia(MQ).matches; }
function unit(id: string): string {
  if (id.startsWith("gh:")) return "PR matches";
  if (id.startsWith("web:")) return "requests";
  if (id === "wiki:commons") return "category additions";
  if (id.startsWith("wiki:")) return "edits";
  if (id.startsWith("maps:")) return "changesets";
  return "platform posts";
}
function sourceLabel(id: string, label: string): string {
  if (id === "wiki:flagged") return "Flagged Wikipedia edits";
  if (id === "wiki:wikidata") return "Wikidata bots (not AI proof)";
  if (id === "maps:ai") return "AI-tool-tagged changesets";
  if (id === "forum:agents") return "Moltbook reported posts";
  return label;
}

/** Each link identifies a source and destination; motion and width do not compare different units. */
export function AgentFlow({ data, records }: { data: FlowData; records: LatestRecord[] }) {
  const W = 760;
  const H = Math.max(240, 40 + Math.max(data.sources.length, data.targets.length) * 34);
  const left = 210;
  const right = 570;
  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);
  const { srcY, tgtY } = useMemo(() => {
    const srcY = new Map<string, number>();
    const tgtY = new Map<string, number>();
    data.sources.forEach((s, i) => srcY.set(s.id, 20 + ((H - 40) / data.sources.length) * (i + 0.5)));
    data.targets.forEach((t, i) => tgtY.set(t.id, 20 + ((H - 40) / data.targets.length) * (i + 0.5)));
    return { srcY, tgtY };
  }, [data, H]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || reduced || records.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % records.length), 4000);
    return () => clearInterval(id);
  }, [paused, reduced, records.length]);
  const currentIndex = records.length ? idx % records.length : 0;
  const current = records[currentIndex];
  const path = (source: string, target: string) => {
    const y1 = srcY.get(source) ?? 0;
    const y2 = tgtY.get(target) ?? 0;
    const mid = (left + right) / 2;
    return `M${left},${y1} C${mid},${y1} ${mid},${y2} ${right},${y2}`;
  };
  return (
    <div className="flow">
      <div className="chart-scroll" tabIndex={0} role="region" aria-label="Evidence sources and destinations; scroll horizontally on small screens">
        <svg className="chart flow-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evidence sources and their destinations; counts use different units">
          <defs>{data.links.map((link, i) => <path key={i} id={`flow-path-${i}`} d={path(link.source, link.target)} />)}</defs>
          {data.links.map((link, i) => <g key={`${link.source}-${link.target}`}>
            <path className="flow-link" d={path(link.source, link.target)} strokeWidth={3}>
              <title>{`${sourceLabel(link.source, data.sources.find((s) => s.id === link.source)?.label ?? link.source)} → ${data.targets.find((t) => t.id === link.target)?.label}: ${fmtInt(link.value)} ${unit(link.source)} recorded in ${data.days} days`}</title>
            </path>
            {!reduced && !paused ? [0, 1].map((k) => <circle key={k} className="flow-dot" r={2.6}><animateMotion dur="6s" begin={`${k * 3}s`} repeatCount="indefinite"><mpath href={`#flow-path-${i}`} /></animateMotion></circle>) : null}
          </g>)}
          {data.sources.map((source) => <g key={source.id} className="flow-node">
            <circle cx={left} cy={srcY.get(source.id)} r={4} />
            <text x={left - 12} y={(srcY.get(source.id) ?? 0) + 4} textAnchor="end" className="flow-label">{sourceLabel(source.id, source.label)}</text>
            <text x={left - 12} y={(srcY.get(source.id) ?? 0) + 16} textAnchor="end" className="flow-count">{fmtInt(source.total)} {unit(source.id)}</text>
          </g>)}
          {data.targets.map((target) => <g key={target.id} className="flow-node">
            <rect x={right} y={(tgtY.get(target.id) ?? 0) - 12} width={6} height={24} rx={1} className="flow-target" />
            <text x={right + 14} y={(tgtY.get(target.id) ?? 0) + 4} className="flow-label">{target.label}</text>
          </g>)}
          {data.links.length === 0 ? <text x={W / 2} y={H / 2} textAnchor="middle" className="flow-label">No source observations available in this window.</text> : null}
        </svg>
      </div>
      <div className="flow-ticker" aria-live={paused || reduced ? "polite" : "off"}>
        {current ? <>
          <span className="label">Replaying {currentIndex + 1}/{records.length}</span>
          <span className="flow-ticker-text"><strong>{current.actor}</strong> {current.action}{" "}{current.url ? <a href={current.url}>{current.target}</a> : current.target}<span className="dim"> · {fmtStamp(current.ts)}</span></span>
        </> : <span className="dim">No recorded examples available.</span>}
        <span className="flow-ticker-controls">
          <button type="button" disabled={reduced} aria-pressed={paused || reduced} title={reduced ? "Automatic playback is off because reduced motion is enabled" : undefined} onClick={() => setPaused((value) => !value)}>{reduced ? "Motion off" : paused ? "Play" : "Pause"}</button>
          {current ? <button type="button" onClick={() => setIdx((i) => (i + 1) % records.length)}>Next</button> : null}
        </span>
      </div>
    </div>
  );
}
