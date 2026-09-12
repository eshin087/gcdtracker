/**
 * Deterministic synthetic fixtures for local browser/performance QA.
 * Never reads DATABASE_URL; refuses non-loopback or non-QA database names.
 */
import { Pool } from "pg";
import { DEMO_READING, DEMO_SOCIAL } from "../src/lib/demo-social";
import { requireQaDatabaseUrl } from "../tests/support/neon-local";
import { PACKAGES } from "../src/lib/ingest/packages";
import { ROBOTS_TOKENS } from "../src/lib/robots/tokens";

const pool = new Pool({ connectionString: requireQaDatabaseUrl() });
const anchor = process.env.QA_SEED_DATE ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isFinite(Date.parse(anchor))) throw new Error("Invalid QA_SEED_DATE");
const today = new Date(anchor + "T00:00:00Z");
const dateAt = (offset: number) => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);
const now = anchor + "T12:00:00Z";
type Row = Record<string, unknown>;
async function insert(table: string, rows: Row[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 300) {
    const values: unknown[] = [];
    const tuples = rows.slice(i, i + 300).map((row) => "(" + keys.map((key) => {
      const value = row[key];
      values.push(value !== null && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : value);
      return "$" + values.length;
    }).join(",") + ")");
    await pool.query('INSERT INTO "' + table + '" (' + keys.map(k => '"' + k + '"').join(",") + ") VALUES " + tuples.join(","), values);
  }
}
async function main() {
try {
  // Deliberately destructive only inside a disposable, validated QA database.
  const tables = ["social_samples","visits","traffic_daily","wiki_edits","wiki_daily","github_daily","github_events","forum_posts","forum_daily","guestbook_notes","ip_ranges","ingest_runs","collector_state","watched_repos","watched_prs","watched_signals","wikidata_bot_edits","commons_ai_uploads","wiki_tag_watch","osm_changesets","osm_daily","osm_sample_seen","mcp_servers","external_series","agent_sightings","gh_archive_hourly","gh_archive_daily","gh_archive_completed"];
  await pool.query("TRUNCATE " + tables.map(t => '"' + t + '"').join(",") + " RESTART IDENTITY");
  const traffic: Row[] = [], archive: Row[] = [], markers: Row[] = [], series: Row[] = [];
  for (let i = 1000; i >= 0; i--) {
    const day = dateAt(i), wave = (i * 17) % 53;
    for (const [category, count] of [["human", 180 + wave], ["ai-training-crawler", 42 + wave], ["ai-user-fetch", 23], ["ai-search-index", 11], ["search-engine", 18]] as const) {
      if (i !== 5) traffic.push({ day, category, count });
    }
    const measures = [["total","events",400000+wave*1000],["total","prs_opened",42000+wave*100],["total","prs_merged",24000],["total","prs_with_body",40000],["total","pushes_with_commits",50000],["total","commits",90000],["agent-prs","claude",1200+wave*10],["agent-prs","copilot",1800+wave*12],["agent-prs","codex-connector",1500+wave*11],["agent-merged","copilot",1300],["pr-signature","claude",1000],["commit-signature","codex",800]];
    for (const [kind,key,value] of measures) archive.push({ day, kind, key, value, hours: i === 0 ? 12 : 24 });
    if (i < 90) for (let h=0; h<(i===0?12:24); h++) markers.push({hour:day+"T"+String(h).padStart(2,"0"),ingest_version:2});
    for (const p of PACKAGES) series.push({source:p.registry,series:p.name,period:day,value:5000+wave*700});
  }
  for (let y=2015;y<=today.getUTCFullYear();y++) for(let m=1;m<=12;m++){
    const period=y+"-"+String(m).padStart(2,"0"); if(period>=anchor.slice(0,7)) continue;
    for(const project of ["all-projects","en.wikipedia"]) for(const agent of ["user","spider","automated"]) series.push({source:"wm-pageviews",series:project+":"+agent,period,value:1000000000+(y-2015)*10000000+m*5000000});
    series.push({source:"stackoverflow",series:"questions",period,value:100000+(y-2015)*1000+m*100});
    for(const [engine,value] of [["google",86],["bing",8],["yahoo",2]]) series.push({source:"statcounter",series:engine,period,value});
    for(const source of ["cc-robots","cc-robots-v2"]){
      series.push({source,series:"_sites",period:period+"-01",value:50000},{source,series:"_files",period:period+"-01",value:1});
      for(const token of ROBOTS_TOKENS) for(const metric of ["mentioned","blocked"]) series.push({source,series:token+":"+metric,period:period+"-01",value:metric==="mentioned"?5000:2500});
    }
  }
  for(let i=27;i>=0;i--) for(const source of ["radar","radar-v2"]){
    for(const [name,value] of [["bot-share:bot",38],["bot-share:human",62],["operator:OPENAI",40+i],["crawl-refer:OPENAI",25+i]]) series.push({source,series:name,period:dateAt(i),value});
  }
  await insert("traffic_daily",traffic); await insert("gh_archive_daily",archive); await insert("gh_archive_completed",markers); await insert("external_series",series);
  const privateValue="PRIVATE_QA_SENTINEL";
  await insert("visits",Array.from({length:80},(_,i)=>({ts:dateAt(i%10)+"T10:"+String(i%60).padStart(2,"0")+":00Z",day:dateAt(i%10),path:i%3===0?"/.well-known/ai-trap/"+privateValue:"/methods?token="+privateValue,method:"GET",ua:"GPTBot/1.0 "+privateValue,agent_slug:"gptbot",agent_name:"GPTBot",operator:"OpenAI",category:"ai-training-crawler",verified:i%2===0,verified_by:"published-ip-range",signed:i%3===0,signature_agent:privateValue,ip_prefix:privateValue,ip_hash:privateValue,country:"US",referer:"https://example.com/"+privateValue,robots_violation:i%3===0,trap_token:privateValue})));
  await insert("guestbook_notes",[{name:"GPTBot",operator:"OpenAI",purpose:"Synthetic QA fixture",note:"A synthetic note for browser testing.",ua:privateValue,agent_slug:"gptbot",signed:true,signature_agent:privateValue,ip_prefix:privateValue,hidden:false,ts:now}]);
  await insert("wiki_edits",Array.from({length:60},(_,i)=>({wiki:"en",rcid:i+1,rev_id:i+1,ts:dateAt(i%10)+"T08:00:00Z",title:"Synthetic article "+i,user:"QA editor "+i,comment:"Fixture edit",tags:["possible-ai-generated"],tier:i%2+1,signals:["disclosure"],old_len:100,new_len:500,url:"https://en.wikipedia.org/w/index.php?diff="+(i+1)})));
  await insert("wiki_daily",Array.from({length:30},(_,i)=>["en","wikidata","commons"].map(wiki=>({day:dateAt(i),wiki,total:10000,bot:3500,anon:800}))).flat());
  await insert("github_daily",Array.from({length:90},(_,i)=>["claude","copilot","codex-branch"].map(agent=>({day:dateAt(i),agent,prs:100+i,tier:"bot-account",final:i>0}))).flat());
  await insert("github_events",Array.from({length:30},(_,i)=>({id:i+1,agent:"copilot",repo:"example/project",number:i+1,title:"Synthetic improvement "+i,url:"https://github.com/example/project/pull/"+(i+1),created_at:dateAt(i%7)+"T09:00:00Z"})));
  await insert("watched_repos",[{repo:"example/project",source:"seed",first_seen:dateAt(30),last_polled_at:now,last_pr_at:now,pr_count_30d:30}]);
  await insert("watched_prs",Array.from({length:30},(_,i)=>({id:"github:"+i,source_id:String(i),platform:"github",kind:"pull_request",title:"Synthetic documented agent change "+i,url:"https://github.com/example/project/pull/"+(i+1),actor_login:"copilot",agent_id:"copilot",attribution:"documented_agent",repository:"example/project",state:"open",created_at:dateAt(i%10)+"T09:00:00Z",source_updated_at:now,evidence:"Documented bot account",body_excerpt:"Synthetic test body"})));
  await insert("watched_signals",[{id:"signal:1",activity_id:"github:1",rule_id:"ai-disclosure",excerpt:"Assisted by an AI tool",status:"unreviewed",url:"https://github.com/example/project/pull/2"}]);
  await insert("forum_posts",Array.from({length:30},(_,i)=>({id:"qa-"+i,agent:"Reported agent "+i,ts:dateAt(i%7)+"T07:00:00Z",title:"Synthetic forum activity "+i,snippet:"Public source-reported fixture.",url:"https://example.com/post/"+i,board:"research",score:i,comments:2})));
  await insert("forum_daily",Array.from({length:30},(_,i)=>({day:dateAt(i),posts:50+i,agents:25})));
  await insert("wikidata_bot_edits",[{revid:1,user:"QA Bot",title:"Q1",ts:now,comment:"Synthetic edit",size:100}]);
  await insert("commons_ai_uploads",[{pageid:1,title:"File:Synthetic QA illustration.png",ts:now,category:"AI-generated images"},{pageid:2,title:"Category:QA non-file excluded",ts:now,category:"AI-generated images"}]);
  await insert("wiki_tag_watch",[{wiki:"en",tag:"possible-ai-generated",hitcount:500,active:true,first_seen:dateAt(90),last_seen:now}]);
  await insert("osm_changesets",Array.from({length:30},(_,i)=>({id:i+1,collection_version:2,ts:dateAt(i%7)+"T08:00:00Z",user:"QA map editor",editor:"Rapid",ai_kind:"rapid",changes:10+i,comment:"Synthetic map improvements "+i,url:"https://www.openstreetmap.org/changeset/"+(i+1)})));
  await insert("osm_daily",Array.from({length:30},(_,i)=>({day:dateAt(i),collection_version:2,sampled:700,ai_assisted:30+i,by_editor:{Rapid:30+i}})));
  await insert("mcp_servers",Array.from({length:40},(_,i)=>({name:"io.example/qa-"+i,status:"active",sync_version:2,title:"Synthetic MCP service "+i,description:"QA fixture, not a live service.",url:"https://example.com/mcp/"+i,published_at:dateAt(i)+"T00:00:00Z",updated_at:now})));
  await insert("collector_state",[{key:"mcp",state:{initialComplete:true,until:now} },...["bot-share","operator","crawl-refer"].map(key=>({key:"radar:"+key,state:{version:2,normalization:key==="operator"?"MIN_MAX":"PERCENTAGE",units:[{name:"value",value:key==="operator"?"normalized":"percentage"}],dateRange:[{startTime:dateAt(28)+"T00:00:00Z",endTime:now}],lastUpdated:now,fetchedAt:now}}))]);
  await insert("agent_sightings",Array.from({length:30},(_,i)=>({kind:"ai-robots-txt",token:"SyntheticAgent"+i,operator:"Example operator",fn:"search",url:"https://example.com/agent/"+i,first_seen:dateAt(i)+"T00:00:00Z"})));
  await insert("ingest_runs",["github","watched","wikimedia","osm","mcp","packages","baseline","radar","gharchive","robots-census","forums","new-agents"].map(source=>({source,started_at:now,finished_at:now,ok:true,stats:{outcome:"success",fixture:true}})));
  const shift = today.getTime() - Date.parse("2026-09-07T00:00:00Z");
  const shifted = (value: string) => new Date(Date.parse(value) + shift).toISOString();
  for (const sample of DEMO_SOCIAL.samples) {
    const {coverage} = sample;
    await insert("social_samples", [{
      platform:sample.platform, day:shifted(sample.day).slice(0,10), collection_version:1,
      started_at:shifted(sample.startedAt), finished_at:shifted(sample.finishedAt),
      sampled_posts:sample.sampledPosts, ai_disclosure_posts:sample.aiDisclosurePosts,
      automated_account_posts:sample.automatedAccountPosts ?? 0, scopes:JSON.stringify(sample.scopes), outcome:sample.outcome,
      coverage:{...coverage, publisherFrom:coverage.publisherFrom && shifted(coverage.publisherFrom),
        publisherTo:coverage.publisherTo && shifted(coverage.publisherTo), rawEvidence:privateValue},
    }]);
  }
  const purpose = DEMO_READING.metadata["crawl-purpose"];
  await insert("collector_state", [{key:"radar:crawl-purpose", state:{...purpose, fetchedAt:now, lastUpdated:now,
    dateRange:[{startTime:dateAt(28)+"T00:00:00Z",endTime:anchor+"T00:00:00Z"}],
    coverage:{startTime:dateAt(28)+"T00:00:00Z",endTime:anchor+"T00:00:00Z",expectedDays:28,observedDays:27,missingDays:[dateAt(16)]},
  }}]);
  await insert("external_series", Object.entries(DEMO_READING.series).flatMap(([name,points]) => points.map(p=>({
    source:"radar-v2",series:name,period:new Date(Date.parse(p.period)+shift-86400000).toISOString().slice(0,10),value:p.value,
  }))));
  console.log("Seeded synthetic fixture at "+anchor+"; "+series.length+" series rows. QA database only.");
} finally { await pool.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
