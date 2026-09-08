"use client";

import { useId, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CalendarHeatmap, MultiLine, type HeatDay, type LineSeries } from "./census-charts";
import { AI_MARKERS, AGENT_LAUNCHES } from "@/lib/census-markers";
import { dayRange, fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { HomeReportsData } from "@/lib/home-reports";

type History = Pick<HomeReportsData,"wikimedia"|"github"|"robots">;
const VIEWS = [
  {id:"reading",label:"Before and after"}, {id:"github",label:"GitHub, by month"}, {id:"robots",label:"Crawler policies"},
] as const;
type View = typeof VIEWS[number]["id"];
const billions = (v:number) => v === 0 ? "0" : (v/1e9).toFixed(1)+"B";
const compact = (v:number) => v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1000 ? Math.round(v/1000)+"k" : String(Math.round(v));
const percent = (v:number) => v.toFixed(1)+"%";

export function CensusHistory({ wikimedia, github, robots }: History) {
  const [view,setView] = useState<View>(wikimedia.length ? "reading" : github.length ? "github" : robots.length ? "robots" : "reading");
  const [measure,setMeasure] = useState<"count"|"share">("count");
  const id = useId();
  const onKey = (e:KeyboardEvent<HTMLDivElement>) => {
    const i = VIEWS.findIndex(v => v.id === view);
    const next = e.key === "ArrowRight" ? (i+1)%VIEWS.length : e.key === "ArrowLeft" ? (i+VIEWS.length-1)%VIEWS.length : e.key === "Home" ? 0 : e.key === "End" ? VIEWS.length-1 : -1;
    if (next < 0) return;
    e.preventDefault();setView(VIEWS[next].id);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  let series:LineSeries[], title:string, caption:React.ReactNode, format:(v:number)=>string;
  let annotations = AI_MARKERS;
  if (view === "reading") {
    series = [
      {key:"human",label:"User-classified",style:"accent",points:wikimedia.map(p => ({x:p.month+"-01",y:p.human}))},
      {key:"spider",label:"Spider",style:"ink",points:wikimedia.map(p => ({x:p.month+"-01",y:p.spider}))},
      {key:"automated",label:"Automated",style:"control",points:wikimedia.map(p => ({x:p.month+"-01",y:p.automated}))},
    ];
    title = "Wikimedia page views per month by agent type";format = billions;
    caption = <>Monthly views across all Wikimedia projects, using the publisher&apos;s user, spider and automated classifications. Automation includes conventional bots. Launch markers give context, not proof of an AI effect. Missing months break the lines. <Link href="/before-after">Read the source context →</Link></>;
  } else if (view === "github") {
    series = measure === "share" ? [
      {key:"share",label:"Agent share",style:"accent",points:github.map(p => ({x:p.period+"-01",y:p.share}))},
    ] : [
      {key:"recorded",label:"Recorded PRs",style:"control",points:github.map(p => ({x:p.period+"-01",y:p.agentPrs}))},
      {key:"validated",label:"Validated months",style:"accent",points:github.map(p => ({x:p.period+"-01",y:p.partial ? null : p.agentPrs}))},
    ];
    title = measure === "share" ? "Agent share of observed public GitHub pull requests by month" : "Agent-attributed public GitHub pull requests by month";
    format = measure === "share" ? percent : compact;
    annotations = [...AI_MARKERS,...AGENT_LAUNCHES];
    caption = <>GH Archive&apos;s public event feed. Dashed counts include incomplete and legacy periods; the orange series requires validated coverage. Shares are withheld for incomplete or unvalidated months. Bot accounts and branch heuristics do not establish model authorship. <Link href="/github">Coverage and method →</Link></>;
  } else {
    series = [
      {key:"gpt",label:"GPTBot",style:"accent",points:robots.map(p => ({x:p.date,y:p.gpt}))},
      {key:"claude",label:"ClaudeBot",style:"ink",points:robots.map(p => ({x:p.date,y:p.claude}))},
    ];
    title = "Explicit named-token blocking in sampled hosts";format = percent;
    caption = <>Full-block directives in Common Crawl&apos;s sampled, readable robots.txt files. Definition v2 only; legacy definitions remain separate. These are policies, not measured compliance or representative whole-web rates. <Link href="/traffic">Crawler policy evidence →</Link></>;
  }
  const points = series.flatMap(s => s.points);
  const available = points.some(p => p.y !== null);
  const first = points.map(p => p.x).sort()[0], last = points.map(p => p.x).sort().at(-1);
  return <div className="census-history">
    <div className="seg" role="tablist" aria-label="Multi-year measurement views" onKeyDown={onKey}>
      {VIEWS.map(v => <button key={v.id} type="button" role="tab" id={id+"-"+v.id} aria-selected={view===v.id}
        aria-controls={id+"-panel"} tabIndex={view===v.id ? 0 : -1} onClick={() => setView(v.id)}>{v.label}</button>)}
    </div>
    <div role="tabpanel" id={id+"-panel"} aria-labelledby={id+"-"+view} tabIndex={0}>
      <div className="census-chart-head">
        <p className="label">{view==="reading" ? "Pageviews per month" : view==="robots" ? "Sampled hosts with explicit full blocks (%)" : measure==="share" ? "Share of observed public PRs (%)" : "Agent-attributed PRs per month"}</p>
        {view==="github" ? <div className="seg compact-seg" role="group" aria-label="GitHub measurement">
          <button type="button" aria-pressed={measure==="count"} onClick={() => setMeasure("count")}>PR count</button>
          <button type="button" aria-pressed={measure==="share"} onClick={() => setMeasure("share")}>Share (%)</button>
        </div> : null}
      </div>
      <figure className="home-chart">
        {available ? <MultiLine series={series} format={format} title={title} annotations={annotations} height={280} labelWidth={155} showPoints={false}/> : <p className="empty">No comparable observations are available for this view yet.</p>}
        {first && last ? <p className="census-range">{fmtDate(first)} – {fmtDate(last)} · full stored history · UTC</p> : null}
        <figcaption>{caption}</figcaption>
      </figure>
    </div>
  </div>;
}

export function ActivityHeatmap({ days, windowEnd }: { days:HomeReportsData["daily"]; windowEnd:string }) {
  const lastComplete = new Date(Date.parse(windowEnd+"T00:00:00Z")-86_400_000).toISOString().slice(0,10);
  const initial = days.at(-1)?.day ?? lastComplete;
  const [selected,setSelected] = useState(initial);
  const [measure,setMeasure] = useState<"count"|"share">("count");
  const counts = measure === "count";
  if (!days.length) return <p className="empty">Daily source observations are unavailable. No empty cell is treated as zero activity.</p>;
  const year = selected.slice(0,4), firstYear = Number(days[0].day.slice(0,4)), lastYear = Number(lastComplete.slice(0,4));
  const years = Array.from({length:Math.max(1,lastYear-firstYear+1)}, (_,i) => String(firstYear+i));
  const end = year === lastComplete.slice(0,4) ? lastComplete : year+"-12-31";
  const byDay = new Map(days.map(d => [d.day,d]));
  const max = Math.max(0,...days.map(d => counts ? d.agentPrs : !d.partial ? d.share ?? 0 : 0));
  const cells:HeatDay[] = dayRange(year+"-01-01",end).map(day => {
    const row = byDay.get(day);
    const value = row ? counts ? row.agentPrs : !row.partial ? row.share : null : null;
    return {day,value,partial:row?.partial ?? false,title:day+" · "+(value===null ? row ? "share unavailable; incomplete or unvalidated coverage" : "no observation" : counts ? fmtInt(value)+" recorded agent PRs"+(row?.partial ? "; incomplete or unvalidated coverage" : "") : fmtPct(value)+" agent share")};
  });
  const detail = byDay.get(selected), valid = detail && !detail.partial && detail.share !== null;
  const observed = cells.filter(d => d.value !== null).length;
  return <div className="home-heatmap">
    <div className="heatmap-controls">
      <label>Year <select aria-label="Heatmap year" value={year} onChange={e => {
        const target = e.target.value===lastComplete.slice(0,4) ? lastComplete : e.target.value+"-12-31";setSelected(target);
      }}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
      <div className="seg compact-seg" aria-label="Heatmap measurement">
        <button type="button" aria-pressed={counts} onClick={() => setMeasure("count")}>Recorded PRs</button>
        <button type="button" aria-pressed={!counts} onClick={() => setMeasure("share")}>Validated share (%)</button>
      </div>
      <p className="meta">{observed}/{cells.length} {counts ? "UTC days with observations" : "comparable UTC days"} - same color scale across years</p>
    </div>
    <CalendarHeatmap days={cells} label={(counts ? "Recorded agent-attributed public GitHub PRs in " : "Agent share of observed public GitHub PRs in ")+year} selectedDay={selected} onSelectDay={setSelected} scaleMax={max} showPartialValues={counts}/>
    <div className="heatmap-legend" aria-label="Heatmap color scale">
      <span><i className="heat-key zero"/>{counts ? "0 PRs" : "0%"}</span>
      <span className="heat-ramp" aria-hidden="true"/>
      <span>{max ? counts ? fmtInt(max)+" PRs" : fmtPct(max) : counts ? "0 recorded PRs" : "No comparable data"}</span>
      <span><i className="heat-key missing"/>No observation</span>
      <span><i className="heat-key partial"/>Incomplete / unvalidated</span>
    </div>
    <div className="heatmap-detail" aria-live="polite">
      <strong>{fmtDate(selected)}</strong>
      {counts && detail ? <><span className="heatmap-value">{fmtInt(detail.agentPrs)}</span><span>recorded agent-attributed PRs - {fmtInt(detail.prsOpened)} total observed PRs</span></> : valid ? <><span className="heatmap-value">{fmtPct(detail.share!)}</span><span>agent share · {fmtInt(detail.agentPrs)} of {fmtInt(detail.prsOpened)} observed PRs</span></>
        : <span>{detail ? "Share unavailable: incomplete or unvalidated source coverage." : "No source observation for this date."}</span>}
      {detail ? <span className="meta">{detail.hours}/24 archive hours · {valid ? "comparable day" : "not comparable"}</span> : null}
    </div>
    <p className="report-source">Select a cell for its evidence; arrow keys move by day or week. This measures coding activity in GH Archive, not web requests. Recorded counts include legacy and incomplete periods and can undercount activity. Hatching marks incomplete or unvalidated coverage; percentages require validated days. The current UTC day is excluded. Missing observations never count as zero.</p>
  </div>;
}
