import { fmtDay, fmtInt } from "@/lib/format";

/* Hand-rolled, server-rendered SVG charts. No client JS. */

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * p;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(2)));
}

export function Sparkline({ values, width = 84, height = 22 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [i * step, height - (v / max) * (height - 2) - 1] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${(pts.length - 1) * step},${height} L0,${height} Z`;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="area" d={area} />
      <path d={d} />
    </svg>
  );
}

export interface Annotation {
  day: string;
  label: string;
}

export interface TimelineProps {
  days: string[];
  bars: number[];
  barLabel: string;
  line?: number[];
  lineLabel?: string;
  annotations?: Annotation[];
  height?: number;
  title?: string;
}

/**
 * Bars on the left axis, optional line on the right axis, dotted grid,
 * annotations as vertical rules with labels above the plot.
 */
export function TimelineChart({ days, bars, barLabel, line, lineLabel, annotations = [], height = 260, title }: TimelineProps) {
  const W = 760;
  const H = height;
  const padL = 44;
  const padR = line ? 44 : 16;
  const padT = annotations.length ? 40 : 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = Math.max(1, days.length);
  const slot = plotW / n;
  const barW = Math.max(1, slot * 0.7);

  const barMax = niceMax(Math.max(...bars, 0));
  const lineMax = line ? niceMax(Math.max(...line, 0)) : 1;
  const y = (v: number, max: number) => padT + plotH - (v / max) * plotH;
  const x = (i: number) => padL + i * slot + slot / 2;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = n > 40 ? 7 : n > 14 ? 3 : 1;
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const linePath = line
    ? line.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v, lineMax).toFixed(1)}`).join(" ")
    : null;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title ?? barLabel}>
      {title ? <title>{title}</title> : null}
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={padL} x2={W - padR} y1={y(t * barMax, barMax)} y2={y(t * barMax, barMax)} />
          <text x={padL - 6} y={y(t * barMax, barMax) + 3} textAnchor="end">
            {compact(t * barMax)}
          </text>
          {line ? (
            <text x={W - padR + 6} y={y(t * lineMax, lineMax) + 3} textAnchor="start">
              {compact(t * lineMax)}
            </text>
          ) : null}
        </g>
      ))}
      <line className="axis" x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} />
      {bars.map((v, i) => (
        <rect
          key={days[i]}
          className="bar"
          x={x(i) - barW / 2}
          y={y(v, barMax)}
          width={barW}
          height={Math.max(0, padT + plotH - y(v, barMax))}
        >
          <title>{`${fmtDay(days[i])}: ${fmtInt(v)} ${barLabel}`}</title>
        </rect>
      ))}
      {linePath ? <path className="line" d={linePath} /> : null}
      {days.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={d} x={x(i)} y={H - 8} textAnchor="middle">
            {fmtDay(d)}
          </text>
        ) : null,
      )}
      {annotations.map((a) => {
        const i = dayIndex.get(a.day);
        if (i === undefined) return null;
        return (
          <g className="annot" key={`${a.day}-${a.label}`}>
            <line x1={x(i)} x2={x(i)} y1={padT - 6} y2={padT + plotH} />
            <text x={x(i) + 4} y={padT - 12} textAnchor="start">
              {a.label}
            </text>
          </g>
        );
      })}
      <g className="legend">
        <rect className="bar" x={padL} y={H - 2} width={0} height={0} />
      </g>
      <g className="legend" transform={`translate(${padL}, ${padT - (annotations.length ? 28 : 4)})`}>
        <rect className="bar" x={0} y={-8} width={10} height={10} />
        <text x={14} y={1}>
          {barLabel}
        </text>
        {line && lineLabel ? (
          <>
            <line className="line" x1={120} x2={140} y1={-3} y2={-3} />
            <text x={146} y={1}>
              {lineLabel}
            </text>
          </>
        ) : null}
      </g>
    </svg>
  );
}

/** A compact bar chart with its own scale; used in small-multiple rows. */
export function MiniChart({ days, values, label }: { days: string[]; values: number[]; label: string }) {
  const W = 240;
  const H = 90;
  const padB = 16;
  const max = niceMax(Math.max(...values, 0));
  const n = Math.max(1, days.length);
  const slot = W / n;
  const barW = Math.max(1, slot * 0.7);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>
        {label} <span className="mono" style={{ textTransform: "none", letterSpacing: 0 }}>· {fmtInt(total)}</span>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line className="axis" x1={0} x2={W} y1={H - padB} y2={H - padB} />
        {values.map((v, i) => {
          const h = (v / max) * (H - padB - 4);
          return (
            <rect key={days[i]} className="bar" x={i * slot + (slot - barW) / 2} y={H - padB - h} width={barW} height={h}>
              <title>{`${fmtDay(days[i])}: ${fmtInt(v)}`}</title>
            </rect>
          );
        })}
        <text x={0} y={H - 3}>
          {fmtDay(days[0] ?? "")}
        </text>
        <text x={W} y={H - 3} textAnchor="end">
          {fmtDay(days[days.length - 1] ?? "")}
        </text>
        <text x={W} y={10} textAnchor="end">
          max {compact(max)}
        </text>
      </svg>
    </div>
  );
}
