"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AgentFlow } from "./AgentFlow";
import type { FlowData } from "@/lib/flow";
import type { LatestRecord } from "@/lib/stats-sources";

const MODES = [
  { id: "contributions", label: "Contributions", description: "Recorded contributions across code repositories, encyclopedias, maps and forums.", href: "/investigations", link: "Contribution evidence" },
  { id: "social", label: "Social publishing", description: "The latest bounded sample from each platform: explicit AI disclosure matches and posts without a disclosure match. Neither group establishes authorship.", href: "/social", link: "Sampling methods and coverage" },
  { id: "crawling", label: "Web crawling", description: "Crawler-purpose shares on the latest complete day in the Cloudflare Radar snapshot. The destination is the web visible to Cloudflare; individual sites are not identified.", href: "/traffic", link: "Crawler trends and evidence" },
] as const;

export function ActivityFlow({ data, records, reading, social }: {
  data: FlowData; records: LatestRecord[]; reading: FlowData; social: FlowData;
}) {
  const id = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const mode = MODES[active];
  // Server-prepared summaries keep unused history out of client props; mount one view.
  const selected = active === 1 ? social : active === 2 ? reading : data;
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % MODES.length
      : event.key === "ArrowLeft" ? (index + MODES.length - 1) % MODES.length
      : event.key === "Home" ? 0 : event.key === "End" ? MODES.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }
  return <div className="activity-flow">
    <div className="activity-modes" role="tablist" aria-label="Activity mode">
      {MODES.map((item, index) => <button key={item.id} ref={node => { tabs.current[index] = node; }}
        type="button" role="tab" id={id + "-" + item.id + "-tab"} aria-controls={id + "-panel"}
        aria-selected={active === index} tabIndex={active === index ? 0 : -1}
        onClick={() => setActive(index)} onKeyDown={event => move(event, index)}>{item.label}</button>)}
    </div>
    <div role="tabpanel" id={id + "-panel"} aria-labelledby={id + "-" + mode.id + "-tab"}>
      <p className="activity-intro">{mode.description} <a href={mode.href}>{mode.link} →</a></p>
      <AgentFlow key={mode.id} data={selected} records={active === 0 ? records : []} showReplay={active === 0}/>
    </div>
  </div>;
}
