import { useId } from "react";

/* ------------------------------------------------------------------ */
/* MultiLine: several series on a true date axis with end labels       */
/* ------------------------------------------------------------------ */

export interface LineSeries {
  key: string;
  label: string;
  points: Array<{ x: string; y: number | null }>;
  /** accent = the leader, ink = graded grey, control = dashed reference */
  style?: "accent" | "ink" | "control";
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * p;
}

const fmtYear = (ms: number) => new Date(ms).toISOString().slice(0, 4);

export interface LineAnnotation {
  day: string;
  label: string;
}

export function MultiLine({
  series,
  format = (v) => String(v),
  title,
  height = 260,
  yMax,
  annotations = [],
  labelWidth = 128,
  showPoints = true,
}: {
  series: LineSeries[];
  format?: (v: number) => string;
  title: string;
  height?: number;
  yMax?: number;
  annotations?: LineAnnotation[];
  /** room on the right for end labels */
  labelWidth?: number;
  /** Long homepage histories use paths plus end labels without a DOM node per point. */
  showPoints?: boolean;
}) {
  const W = 760;
  const H = height;
  const padL = 44;
  const padR = labelWidth;
  const padT = annotations.length ? 30 + 14*Math.min(3,annotations.length-1) : 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;
  const xs = all.map((p) => Date.parse(`${p.x}T00:00:00Z`));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const span = Math.max(1, x1 - x0);
  const max = yMax ?? niceMax(Math.max(...all.flatMap(p => p.y !== null && Number.isFinite(p.y) ? [p.y] : []), 0));
  const X = (d: string) => padL + ((Date.parse(`${d}T00:00:00Z`) - x0) / span) * plotW;
  const Y = (v: number) => padT + plotH - (Math.min(v, max) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  // Year rules along the x axis.
  const years: number[] = [];
  for (let y = Number(fmtYear(x0)) + 1; y <= Number(fmtYear(x1)); y++) years.push(Date.UTC(y, 0, 1));

  // End labels: sort by final y and push apart so none overlap.
  const ends = series
    .flatMap((s) => {
      const last = s.points.findLast(p => p.y !== null && Number.isFinite(p.y));
      return last && last.y !== null ? [{ s, x: X(last.x), y: Y(last.y), value: last.y, date:last.x }] : [];
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
  for (let i = ends.length - 1; i >= 0; i--) {
    const floor = padT + plotH + 4;
    if (ends[i].y > floor) ends[i].y = floor;
    if (i < ends.length - 1 && ends[i + 1].y - ends[i].y < 12) ends[i].y = ends[i + 1].y - 12;
  }

  const annotationEnds: number[] = [];
  const visibleAnnotations = annotations
    .filter(a => Date.parse(a.day+"T00:00:00Z") >= x0 && Date.parse(a.day+"T00:00:00Z") <= x1)
    .sort((a,b) => a.day.localeCompare(b.day))
    .map(a => {
      const x = Math.min(X(a.day)+4,W-a.label.length*6.2-6);
      let row = annotationEnds.findIndex(end => x > end+8);
      if (row < 0) row = annotationEnds.length;
      annotationEnds[row] = x+a.label.length*6.2;
      return {...a,x,row};
    });
  const inkCount = series.filter((s) => (s.style ?? "ink") === "ink").length;
  let inkIndex = 0;

  return (
    <div className="chart-scroll" tabIndex={0} role="region" aria-label={title + "; scroll horizontally on small screens"}><svg className="chart multiline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      <title>{title}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={padL} x2={W - padR} y1={Y(t * max)} y2={Y(t * max)} />
          <text x={padL - 6} y={Y(t * max) + 3} textAnchor="end">
            {format(t * max)}
          </text>
        </g>
      ))}
      {years.map((ms) => {
        const x = padL + ((ms - x0) / span) * plotW;
        return (
          <g key={ms}>
            <line className="grid" x1={x} x2={x} y1={padT} y2={padT + plotH} />
            <text x={x} y={H - 8} textAnchor="middle">
              {fmtYear(ms)}
            </text>
          </g>
        );
      })}
      <text x={padL} y={H - 8} textAnchor="start">
        {fmtYear(x0)}
      </text>
      <line className="axis" x1={padL} x2={W - padR} y1={padT + plotH} y2={padT + plotH} />
      {visibleAnnotations.map((a) => (
          <g className="annot" key={`${a.day}-${a.label}`}>
            <line x1={X(a.day)} x2={X(a.day)} y1={padT - 6} y2={padT + plotH} />
            <text x={a.x} y={padT - 10 - a.row*14} textAnchor="start">
              {a.label}
            </text>
          </g>
        ))}
      {series.map((s) => {
        const style = s.style ?? "ink";
        const opacity = style === "ink" ? 0.95 - (inkIndex++ / Math.max(1, inkCount)) * 0.55 : 1;
        const d = s.points.map((p, i) => p.y === null || !Number.isFinite(p.y) ? "" :
          `${i === 0 || s.points[i-1].y === null || !Number.isFinite(s.points[i-1].y) ? "M" : "L"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
        return (
          <g key={s.key} className={`series ${style}`} style={{ opacity }}>
            <path d={d} />
            {(showPoints ? s.points : s.points.filter(p => p.y !== null).length === 1 ? s.points : []).map(p => p.y === null || !Number.isFinite(p.y) ? null : (
              <circle key={p.x} cx={X(p.x)} cy={Y(p.y)} r={2}>
                <title>{`${s.label} · ${p.x}: ${format(p.y)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
      {ends.map((e) => (
        <text key={e.s.key} className={`end-label ${e.s.style ?? "ink"}`} x={W - padR + 8} y={e.y + 3} textAnchor="start">
          {e.s.label} {format(e.value)}
          <title>{`${e.s.label} · latest observation ${e.date}: ${format(e.value)}`}</title>
        </text>
      ))}
    </svg></div>
  );
}

/* ------------------------------------------------------------------ */
/* CalendarHeatmap: one cell per day, weeks as columns                 */
/* ------------------------------------------------------------------ */

export interface HeatDay {
  day: string;
  /** 0..1, null when no data */
  value: number | null;
  partial?: boolean;
  title: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function CalendarHeatmap({ days, label, selectedDay, onSelectDay, scaleMax, showPartialValues = false }: {
  days: HeatDay[]; label: string; selectedDay?: string;
  onSelectDay?: (day: string) => void; scaleMax?: number; showPartialValues?: boolean;
}) {
  const hatchId = "heat-hatch-"+useId().replaceAll(":","");
  if (days.length === 0) return null;
  const cell = 7;
  const gap = 1;
  const step = cell + gap;
  const padL = 28;
  const padT = 16;
  const byDay = new Map(days.map((d) => [d.day, d]));
  const first = new Date(`${days[0].day}T00:00:00Z`);
  const last = new Date(`${days[days.length - 1].day}T00:00:00Z`);
  // Start on the Monday of the first week.
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * 86_400_000);
  const totalDays = Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1;
  const weeks = Math.ceil(totalDays / 7);
  const max = Math.max(scaleMax ?? Math.max(...days.map(d => d.partial && !showPartialValues ? 0 : d.value ?? 0)), 0.0001);
  const W = padL + weeks * step + 4;
  const H = padT + 7 * step + 2;
  const cells: Array<{ x: number; y: number; d: HeatDay }> = [];
  const monthLabels: Array<{ x: number; text: string }> = [];
  let lastMonth = -1;
  let lastLabelEnd = -Infinity; // ~5.6px per character at 10px
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(start.getTime() + i * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const week = Math.floor(i / 7);
    const dow = (date.getUTCDay() + 6) % 7;
    if (date.getUTCMonth() !== lastMonth && dow === 0 && date >= first) {
      lastMonth = date.getUTCMonth();
      const x = padL + week * step;
      const text = date.getUTCMonth() === 0 || monthLabels.length === 0 ? `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : MONTHS[date.getUTCMonth()];
      if (x >= lastLabelEnd) {
        monthLabels.push({ x, text });
        lastLabelEnd = x + text.length * 5.6 + 8;
      }
    }
    const d = byDay.get(key) ?? (date >= first ? {day:key,value:null,title:key+" · no observation"} : null);
    if (d) cells.push({ x: padL + week * step, y: padT + dow * step, d });
  }
  return (
    <div className="chart-scroll" tabIndex={0} role="region" aria-label={label+"; scroll horizontally on small screens"}>
      <svg className="chart heatmap" viewBox={`0 0 ${W} ${H}`} role={onSelectDay ? "group" : "img"} aria-label={label} style={{ minWidth: Math.min(W, 640) }}>
        <title>{label}</title>
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width={4} height={4} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={4} className="hatch" />
          </pattern>
        </defs>
        {monthLabels.map((m) => (
          <text key={`${m.x}-${m.text}`} x={m.x} y={padT - 6} textAnchor="start">
            {m.text}
          </text>
        ))}
        {["Mon", "Wed", "Fri", "Sun"].map((t, i) => (
          <text key={t} x={padL - 6} y={padT + [0, 2, 4, 6][i] * step + cell - 2} textAnchor="end">
            {t}
          </text>
        ))}
        {cells.map(({ x, y, d }) => (
          <g key={d.day}>
            <rect className={`cell ${d.partial ? "partial" : d.value === null ? "missing" : "observed"}`}
              data-day={d.day} x={x} y={y} width={cell} height={cell} rx={1}
              style={d.value !== null && (!d.partial || showPartialValues) ? {fill:"var(--accent)",fillOpacity:0.12+0.88*Math.min(1,Math.max(0,d.value/max))} : undefined}
              role={onSelectDay ? "button" : undefined} tabIndex={onSelectDay && d.day === selectedDay ? 0 : onSelectDay ? -1 : undefined}
              aria-label={onSelectDay ? d.title : undefined} aria-pressed={onSelectDay ? d.day === selectedDay : undefined}
              onClick={onSelectDay ? () => onSelectDay(d.day) : undefined}
              onKeyDown={onSelectDay ? e => {
                if (e.key === "Enter" || e.key === " ") {e.preventDefault();onSelectDay(d.day);return;}
                const offset = {ArrowLeft:-7,ArrowRight:7,ArrowUp:-1,ArrowDown:1}[e.key];
                if (offset === undefined) return;
                e.preventDefault();
                const next = new Date(Date.parse(d.day+"T00:00:00Z")+offset*86_400_000).toISOString().slice(0,10);
                const target = e.currentTarget.ownerSVGElement?.querySelector<SVGRectElement>(`[data-day="${next}"]`);
                if (target) {onSelectDay(next);target.focus();}
              } : undefined}>
              <title>{d.title}</title>
            </rect>
            {d.partial ? <rect x={x} y={y} width={cell} height={cell} rx={1} fill={`url(#${hatchId})`} pointerEvents="none" /> : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
