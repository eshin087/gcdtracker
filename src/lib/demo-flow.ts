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
    {key:"visits",label:"This site's request sensor",outcome:"unknown",lastRun:null,stale:false},
    {key:"wikipedia",label:"Wikipedia",outcome:"partial",lastRun:"2026-09-07T00:15:00Z",stale:false},
    {key:"wikimedia",label:"Wikimedia",outcome:"success",lastRun:"2026-09-07T00:20:00Z",stale:false},
    {key:"osm",label:"OSM sample v2",outcome:"partial",lastRun:"2026-09-07T00:25:00Z",stale:false},
    {key:"moltbook",label:"Moltbook",outcome:"failed",lastRun:"2026-09-04T00:30:00Z",stale:true},
  ],
  sources:[
    source("gh:copilot","GitHub Copilot",12840,"github","PR matches","Code contributions","Documented bot account","/github","Illustrative GitHub Search counts. Bot-account and branch-prefix matches may overlap."),
    source("gh:claude","Claude Code",7360,"github","PR matches","Code contributions","Documented bot account","/github","A bot account supports account attribution, not a specific model or the amount of code it wrote."),
    source("gh:codex-branch","Codex branch matches",4820,"github","PR matches","Code contributions","Branch-name heuristic","/github","A matching branch name does not independently prove tool use."),
    {...source("web:training","Training crawlers",18400,"visits","requests","Training / dataset crawling","Claimed user agent + IP checks","/visitors","Synthetic requests to one site; purpose is declared, not inferred from model behavior."),
      verification:{requests:18400,matched:12900,checkable:15600,signatureHeaders:160}},
    {...source("web:search","AI search indexers",8300,"visits","requests","Search indexing","Claimed user agent + IP checks","/traffic","Search-indexing requests are separate from training and user-triggered retrieval."),
      verification:{requests:8300,matched:5100,checkable:6700,signatureHeaders:43}},
    {...source("web:fetchers","User-triggered fetchers",3600,"visits","requests","User-triggered retrieval","Claimed user agent + IP checks","/visitors","The catalogue describes the declared purpose. These samples do not expose a user's prompt."),
      verification:{requests:3600,matched:2100,checkable:2800,signatureHeaders:29}},
    source("wiki:flagged","Flagged Wikipedia edits",420,"wikipedia","edits","Encyclopedia editing","Platform filters / heuristics","/wikipedia","Illustrative flagged edits; a filter is evidence of a possible issue, not proof of AI authorship."),
    source("wiki:wikidata","Wikidata bots",24100,"wikimedia","edits","Structured-data editing","Bot-account activity","/wikipedia/wikimedia","Automation includes conventional scripts and does not establish AI use."),
    source("wiki:commons","Commons AI-category files",320,"wikimedia","files","Media categorization","Tracked category additions","/wikipedia/wikimedia","File additions to tracked AI categories, not uploads. Non-file entries are excluded."),
    {...source("maps:ai","AI-assisted map tools",740,"osm","changesets","Map editing","Self-declared editor tags","/maps","Collection v2: deduplicated, capped overlapping samples. Legacy v1 totals are excluded."),observedDays:12},
    {...source("forum:agents","Moltbook reported agents",1180,"moltbook","posts","Forum discussion","Platform-reported activity","/forums","A failed refresh does not erase previous observations. Platform claims are not independent authorship verification."),observedDays:19},
  ],
  links:[],
};
DEMO_FLOW.links = DEMO_FLOW.sources.map(s => ({source:s.id,target:s.feed === "github" ? "code" : s.feed === "visits" ? "site" : s.feed === "osm" ? "maps" : s.feed === "moltbook" ? "forums" : "wikis",value:s.total}));
export const DEMO_RECORDS: LatestRecord[] = [
  {id:"demo-visit",kind:"visit",actor:"Example training crawler",action:"requested",target:"this site's methodology",url:null,ts:"2026-09-06T18:30:00Z"},
  {id:"demo-pr",kind:"pr",actor:"Example coding agent",action:"opened",target:"a synthetic pull request",url:null,ts:"2026-09-06T18:25:00Z"},
  {id:"demo-map",kind:"map",actor:"Example map editor",action:"submitted",target:"a synthetic AI-tool-tagged changeset",url:null,ts:"2026-09-06T18:20:00Z"},
  {id:"demo-wiki",kind:"wiki",actor:"Example wiki editor",action:"made",target:"a synthetic filter-flagged edit",url:null,ts:"2026-09-06T18:15:00Z"},
];
