import { FLOW_TARGETS, type FlowData, type FlowSource } from "./flow";
import type { LatestRecord } from "./stats-sources";

/** Fixed illustrative data. This module never reads or writes a database. */
const observed = "2026-09-06T18:30:00Z";
const base = { observedDays: 28, latestObservation: observed };
const source = (id:string,label:string,total:number,feed:string,unit:FlowSource["unit"],purpose:string,evidence:string,href:string,method:string):FlowSource =>
  ({...base,id,label,total,feed,unit,purpose,evidence,href,method});
export const DEMO_FLOW: FlowData = {
  mode:"demo",days:30,windowStart:"2026-08-08",windowEnd:"2026-09-07",targets:FLOW_TARGETS,
  feeds:[
    {key:"github",label:"GitHub Search",outcome:"success",lastRun:"2026-09-07T00:10:00Z",stale:false},
    {key:"wikipedia",label:"Wikipedia",outcome:"partial",lastRun:"2026-09-07T00:15:00Z",stale:false},
    {key:"wikimedia",label:"Wikimedia",outcome:"success",lastRun:"2026-09-07T00:20:00Z",stale:false},
    {key:"osm",label:"OSM sample v2",outcome:"partial",lastRun:"2026-09-07T00:25:00Z",stale:false},
    {key:"moltbook",label:"Moltbook",outcome:"failed",lastRun:"2026-09-04T00:30:00Z",stale:true},
  ],
  sources:[
    source("gh:copilot","GitHub Copilot",12840,"github","PR matches","Code contributions","Documented bot account","/github","Illustrative GitHub Search counts. Bot-account and branch-prefix matches may overlap."),
    source("gh:claude","Claude Code",7360,"github","PR matches","Code contributions","Documented bot account","/github","A bot account supports account attribution, not a specific model or the amount of code it wrote."),
    source("gh:codex-branch","Codex branch matches",4820,"github","PR matches","Code contributions","Branch-name heuristic","/github","A matching branch name does not independently prove tool use."),
    source("wiki:flagged","Flagged Wikipedia edits",420,"wikipedia","edits","Encyclopedia editing","Platform filters / heuristics","/wikipedia","Illustrative flagged edits; a filter is evidence of a possible issue, not proof of AI authorship."),
    source("wiki:wikidata","Wikidata bots",24100,"wikimedia","edits","Structured-data editing","Bot-account activity","/wikipedia/wikimedia","Automation includes conventional scripts and does not establish AI use."),
    source("wiki:commons","Commons AI-category files",320,"wikimedia","files","Media categorization","Tracked category additions","/wikipedia/wikimedia","File additions to tracked AI categories, not uploads. Non-file entries are excluded."),
    {...source("maps:ai","AI-assisted map tools",740,"osm","changesets","Map editing","Self-declared editor tags","/maps","Collection v2: deduplicated, capped overlapping samples. Legacy v1 totals are excluded."),observedDays:12},
    {...source("forum:agents","Moltbook reported agents",1180,"moltbook","posts","Forum discussion","Platform-reported activity","/forums","A failed refresh does not erase previous observations. Platform claims are not independent authorship verification."),observedDays:19},
  ],
  links:[],
};
DEMO_FLOW.links = DEMO_FLOW.sources.map(s => ({source:s.id,target:s.feed === "github" ? "code" : s.feed === "osm" ? "maps" : s.feed === "moltbook" ? "forums" : "wikis",value:s.total}));
export const DEMO_RECORDS: LatestRecord[] = [
  {id:"demo-pr",kind:"pr",actor:"Example coding agent",action:"opened",target:"a synthetic pull request",url:null,ts:"2026-09-06T18:25:00Z"},
  {id:"demo-map",kind:"map",actor:"Example map editor",action:"submitted",target:"a synthetic AI-tool-tagged changeset",url:null,ts:"2026-09-06T18:20:00Z"},
  {id:"demo-wiki",kind:"wiki",actor:"Example wiki editor",action:"made",target:"a synthetic filter-flagged edit",url:null,ts:"2026-09-06T18:15:00Z"},
];


// Fixed illustrative source reports; never used as a fallback for observed data.
export const DEMO_REPORTS: import("./home-reports").HomeReportsData = {
  githubWeek: {agentPrs: 36420, prsOpened: 620000, days: 7},
  github: Array.from({length:12}, (_,i) => ({
    period: new Date(Date.UTC(2025,8+i,1)).toISOString().slice(0,7),
    agentPrs: 88000+i*12700, share: i===8 ? null : 2.8+i*.28, partial:i===8, hours:i===8 ? 590 : 720,
  })),
  robots: Array.from({length:12}, (_,i) => ({
    date: new Date(Date.UTC(2025,8+i,1)).toISOString().slice(0,10),
    sites: 380000+i*4000,gpt:14+i*1.4,claude:11+i*1.6,
  })),
  wikimedia: Array.from({length:12}, (_,i) => ({
    month:new Date(Date.UTC(2025,8+i,1)).toISOString().slice(0,7),
    spider:2400000000+i*150000000,automated:i===7 ? null : 1300000000+i*180000000,
  })),
  radar:{
    bots:[{name:"Googlebot",value:38.2},{name:"GPTBot",value:16.8},{name:"ClaudeBot",value:14.5},{name:"Bingbot",value:11.1},{name:"PerplexityBot",value:8.6},{name:"Other bots",value:10.8}],
    meta:{version:2,normalization:"PERCENTAGE",units:[],dateRange:[{startTime:"2026-08-31T00:00:00Z",endTime:"2026-09-07T00:00:00Z"}],fetchedAt:"2026-09-07T00:30:00Z",lastUpdated:"2026-09-07T00:00:00Z"},
  },
};
