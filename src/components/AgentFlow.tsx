"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { fmtInt, relTime } from "@/lib/format";
import type { FlowData, LatestRecord } from "@/lib/stats-sources";

const MQ = "(prefers-reduced-motion: reduce)";
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getMotion() {
  return window.matchMedia(MQ).matches;
}

/**
 * Agents → destinations. Left: who is acting; right: what kind of place they act on.
 * Link width and dot rate follow real 30-day counts. Pure inline SVG with SMIL
 * animateMotion, no library; respects prefers-reduced-motion.
 */
export function AgentFlow({ data, records }: { data: FlowData; records: LatestRecord[] }) {
  const W = 760;
  const H = Math.max(240, 40 + Math.max(data.sources.length, data.targets.length) * 34);
  const padL = 200;
  const padR = 190;
  const left = padL;
  const right = W - padR;

  const reduced = useSyncExternalStore(subscribeMotion, getMotion, () => false);

  const { srcY, tgtY, max } = useMemo(() => {
    const sy = new Map<string, number>();
    const ty = new Map<string, number>();
    const gapS = data.sources.length > 0 ? (H - 40) / data.sources.length : 0;
    const gapT = data.targets.length > 0 ? (H - 40) / data.targets.length : 0;
    data.sources.forEach((s, i) => sy.set(s.id, 20 + gapS * (i + 0.5)));
    data.targets.forEach((t, i) => ty.set(t.id, 20 + gapT * (i + 0.5)));
    return { srcY: sy, tgtY: ty, max: Math.max(1, ...data.links.map((l) => l.value)) };
  }, [data, H]);

  // Ticker: replay real records one at a time.
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || records.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % records.length), 4000);
    return () => clearInterval(id);
  }, [paused, records.length]);
  const current = records[idx];

  const empty = data.links.length === 0;

  return (
    <div className="flow">
      <svg className="chart flow-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Which agents act on which kinds of website">
        <defs>
          {data.links.map((l, i) => {
            const y1 = srcY.get(l.source) ?? 0;
            const y2 = tgtY.get(l.target) ?? 0;
            const c = (left + right) / 2;
            return <path key={i} id={`flow-path-${i}`} d={`M${left},${y1} C${c},${y1} ${c},${y2} ${right},${y2}`} />;
          })}
        </defs>
        {data.links.map((l, i) => {
          const y1 = srcY.get(l.source) ?? 0;
          const y2 = tgtY.get(l.target) ?? 0;
          const c = (left + right) / 2;
          const w = 1.5 + (Math.sqrt(l.value / max) || 0) * 14;
          const dots = Math.min(6, Math.max(1, Math.round((l.value / max) * 6)));
          const dur = 5 + (1 - l.value / max) * 4;
          return (
            <g key={`${l.source}-${l.target}`}>
              <path className="flow-link" d={`M${left},${y1} C${c},${y1} ${c},${y2} ${right},${y2}`} strokeWidth={w}>
                <title>{`${data.sources.find((s) => s.id === l.source)?.label} → ${data.targets.find((t) => t.id === l.target)?.label}: ${fmtInt(l.value)} in ${data.days} days`}</title>
              </path>
              {!reduced
                ? Array.from({ length: dots }).map((_, k) => (
                    <circle key={k} className="flow-dot" r={2.6}>
                      <animateMotion dur={`${dur}s`} begin={`${(k * dur) / dots}s`} repeatCount="indefinite" rotate="auto">
                        <mpath href={`#flow-path-${i}`} />
                      </animateMotion>
                    </circle>
                  ))
                : null}
            </g>
          );
        })}
        {data.sources.map((s) => {
          const y = srcY.get(s.id) ?? 0;
          return (
            <g key={s.id} className="flow-node">
              <circle cx={left} cy={y} r={4} />
              <text x={left - 12} y={y + 4} textAnchor="end" className="flow-label">
                {s.label}
              </text>
              <text x={left - 12} y={y + 16} textAnchor="end" className="flow-count">
                {fmtInt(s.total)}
              </text>
            </g>
          );
        })}
        {data.targets.map((t) => {
          const y = tgtY.get(t.id) ?? 0;
          return (
            <g key={t.id} className="flow-node">
              <rect x={right} y={y - 12} width={6} height={24} rx={1} className="flow-target" />
              <text x={right + 14} y={y + 4} className="flow-label">
                {t.label}
              </text>
              <text x={right + 14} y={y + 16} className="flow-count">
                {fmtInt(t.total)}
              </text>
            </g>
          );
        })}
        {empty ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" className="flow-label">
            The flow draws itself once the sensors have recorded activity.
          </text>
        ) : null}
      </svg>
      <div className="flow-ticker" aria-live="polite">
        {current ? (
          <>
            <span className="label">Replaying {idx + 1}/{records.length}</span>
            <span className="flow-ticker-text">
              <strong>{current.actor}</strong> {current.action}{" "}
              {current.url ? <a href={current.url}>{current.target}</a> : current.target}
              <span className="dim"> · {relTime(current.ts)}</span>
            </span>
            <span className="flow-ticker-controls">
              <button type="button" onClick={() => setPaused((p) => !p)}>
                {paused ? "Play" : "Pause"}
              </button>
              <button type="button" onClick={() => setIdx((i) => (i + 1) % records.length)}>
                Next
              </button>
            </span>
          </>
        ) : (
          <span className="dim">Real records replay here as they arrive.</span>
        )}
      </div>
    </div>
  );
}
