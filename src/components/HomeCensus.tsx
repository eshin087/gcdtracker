"use client";

import { useId, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { CalendarHeatmap, MultiLine, type HeatDay, type LineSeries } from "./census-charts";
import { AI_MARKERS, AGENT_LAUNCHES } from "@/lib/census-markers";
import { dayRange, fmtDate, fmtInt, fmtPct } from "@/lib/format";
import type { HomeReportsData } from "@/lib/home-reports";
import { SEARCH_DETECTOR_KEYS, SEARCH_REFERENCES } from "@/lib/github/search-census";

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

type HeatRow = { day:string; share:number|null; partial:boolean; agentPrs:number|null; prsOpened:number|null; note:string };
type HeatSource = "search"|"archive";

export function ActivityHeatmap({ archive, search, windowEnd }: { archive:HomeReportsData["daily"]; search:HomeReportsData["searchDaily"]; windowEnd:string }) {
  const lastComplete = new Date(Date.parse(windowEnd+"T00:00:00Z")-86_400_000).toISOString().slice(0,10);
  const rows:Record<HeatSource,HeatRow[]> = {
    search: search.map(d => ({...d, note:`${d.detectorsFinal}/${SEARCH_DETECTOR_KEYS.length} detector counts final · ${d.referencesPresent}/${SEARCH_REFERENCES.length} reference counts`})),
    archive: archive.map(d => ({...d, note:`${d.hours}/24 archive hours`})),
  };
  const comparable = (list:HeatRow[]) => list.some(d => !d.partial && d.share !== null);
  const [source,setSource] = useState<HeatSource>(comparable(rows.search) || !comparable(rows.archive) ? "search" : "archive");
  const days = rows[source];
  const sourceEnd = source === "archive" ? (days.at(-1)?.day ?? lastComplete) : lastComplete;
  const [selected,setSelected] = useState(days.at(-1)?.day ?? lastComplete);
  const switchSource = (next:HeatSource) => { setSource(next); setSelected(rows[next].at(-1)?.day ?? lastComplete); };
  const archiveEnd = rows.archive.at(-1)?.day;
  const sourcePicker = <label>Source <select aria-label="Heatmap source" value={source} onChange={e => switchSource(e.target.value as HeatSource)}>
    <option value="search">GitHub search v1 (current)</option>
    <option value="archive">{archiveEnd ? "GH Archive (history to "+fmtDate(archiveEnd)+")" : "GH Archive (history)"}</option>
  </select></label>;
  if (!days.length) return <div className="home-heatmap">
    <div className="heatmap-controls">{sourcePicker}</div>
    <p className="empty">{source === "search" ? "GitHub search census days are still being collected. No empty cell is treated as zero activity." : "Daily source observations are unavailable. No empty cell is treated as zero activity."}</p>
  </div>;
  const year = selected.slice(0,4), firstYear = Number(days[0].day.slice(0,4)), lastYear = Number(sourceEnd.slice(0,4));
  const years = Array.from({length:Math.max(1,lastYear-firstYear+1)}, (_,i) => String(firstYear+i));
  const end = year === lastComplete.slice(0,4) ? lastComplete : year+"-12-31";
  const byDay = new Map(days.map(d => [d.day,d]));
  // Each source keeps its own scale: the two detectors are not comparable with each other.
  const max = Math.max(0,...days.filter(d => !d.partial).map(d => d.share ?? 0));
  const cells:HeatDay[] = dayRange(year+"-01-01",end).map(day => {
    const row = byDay.get(day);
    const value = row && !row.partial ? row.share : null;
    return {day,value,partial:row?.partial ?? false,title:day+" · "+(value===null ? row?.partial ? "share unavailable; incomplete or unvalidated coverage" : "no observation" : fmtPct(value)+" agent share")};
  });
  const detail = byDay.get(selected), valid = detail && !detail.partial && detail.share !== null;
  const observed = cells.filter(d => d.value !== null).length;
  return <div className="home-heatmap">
    <div className="heatmap-controls">
      {sourcePicker}
      <label>Year <select aria-label="Heatmap year" value={year} onChange={e => {
        const target = e.target.value===lastComplete.slice(0,4) ? lastComplete : e.target.value+"-12-31";setSelected(target);
      }}>{years.map(y => <option key={y}>{y}</option>)}</select></label>
      <p className="meta">{observed}/{cells.length} comparable UTC days · same color scale across years for this source</p>
    </div>
    <CalendarHeatmap days={cells} label={"Agent share of public GitHub PRs in "+year+", "+(source === "search" ? "GitHub search v1" : "GH Archive")} selectedDay={selected} onSelectDay={setSelected} scaleMax={max}/>
    <div className="heatmap-legend" aria-label="Heatmap color scale">
      <span><i className="heat-key zero"/>0%</span>
      <span className="heat-ramp" aria-hidden="true"/>
      <span>{max ? fmtPct(max) : "No comparable data"}</span>
      <span><i className="heat-key missing"/>No observation</span>
      <span><i className="heat-key partial"/>Incomplete / unvalidated</span>
    </div>
    <div className="heatmap-detail" aria-live="polite">
      <strong>{fmtDate(selected)}</strong>
      {valid ? <><span className="heatmap-value">{fmtPct(detail.share!)}</span><span>agent share · {fmtInt(detail.agentPrs)} of {fmtInt(detail.prsOpened)} public PRs</span></>
        : <span>{detail?.partial ? "Share unavailable: incomplete or unvalidated source coverage." : "No source observation for this date."}</span>}
      {detail ? <span className="meta">{detail.note} · {valid ? "comparable day" : "not comparable"}</span> : null}
    </div>
    <p className="report-source">{source === "search"
      ? `Deduplicated union of ${SEARCH_DETECTOR_KEYS.length} documented bot-account and branch-prefix detectors, divided by all public PRs opened that UTC day, both counted with GitHub search after the day ends. Measured overlaps between agent apps and their own branch prefixes are subtracted. Bot accounts and branch names suggest, but do not prove, agent use. This is a different detector from GH Archive and the two are never combined.`
      : "Historical: GH Archive coverage ended when its worker was retired on 9 September 2026. This measures coding activity in GH Archive, not web requests."} Select a cell for its evidence; arrow keys move by day or week. The current UTC day is excluded. Empty and hatched cells never count as zero.</p>
  </div>;
}
