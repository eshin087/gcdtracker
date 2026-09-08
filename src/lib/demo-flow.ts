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
const demoStart = Date.UTC(2025,0,1), demoEnd = Date.UTC(2026,8,7);
export const DEMO_REPORTS: import("./home-reports").HomeReportsData = {
  windowEnd:"2026-09-07",
  githubWeek: {agentPrs: 36420, prsOpened: 620000, days: 7},
  github: Array.from({length:44}, (_,i) => ({
    period: new Date(Date.UTC(2023,i,1)).toISOString().slice(0,7),
    agentPrs: i<24 ? 0 : Math.round(3000*Math.pow(i-22,1.55)),
    share: i===38 ? null : i<24 ? 0 : (i-23)*.36, partial:i===38, hours:i===38 ? 590 : 720,
  })),
  robots: Array.from({length:44}, (_,i) => ({
    date: new Date(Date.UTC(2023,i,1)).toISOString().slice(0,10),
    sites: 260000+i*4000,gpt:i<8 ? 0 : Math.min(36,1+(i-8)*.9),claude:i<14 ? 0 : Math.min(34,1+(i-14)*1.05),
  })),
  wikimedia: Array.from({length:140}, (_,i) => ({
    month:new Date(Date.UTC(2015,i,1)).toISOString().slice(0,7),
    human:17e9-i*24000000+Math.sin(i/6)*900000000,
    spider:1.6e9+i*14000000+Math.sin(i/4)*180000000+Math.max(0,i-90)*52000000,
    automated:i<60 || i===112 ? null : .8e9+(i-60)*34000000+Math.max(0,i-90)*74000000,
  })),
  daily:Array.from({length:(demoEnd-demoStart)/86400000},(_,i) => {
    const day = new Date(demoStart+i*86400000).toISOString().slice(0,10);
    const partial = i%31===9 || (i>410 && i<425);
    const share = i%53===0 ? 0 : Math.max(0,.012+i*.0002+Math.sin(i/16)*.025+(i%7>4 ? .03 : 0));
    return {day,share:partial ? null : share,partial,hours:partial ? 12 : 24,agentPrs:Math.round(45000*share),prsOpened:45000};
  }).filter((_,i) => i%47!==0),
};
