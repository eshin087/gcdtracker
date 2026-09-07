import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../src/lib/db";
import { createNeonBridge } from "./support/neon-local";
import { dayOf, daysAgo } from "../src/lib/format";

const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("../src/lib/db", () => ({ get db() { return state.db; } }));
import { getFlowData, getLatestRecords } from "../src/lib/stats-sources";

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
beforeAll(async () => {
  bridge = await createNeonBridge();
  state.db = bridge.db;
});
afterAll(async () => { state.db = null; await bridge?.close(); });

beforeEach(async () => {
  await bridge.query("truncate visits, github_daily, wiki_edits, wikidata_bot_edits, commons_ai_uploads, osm_daily, forum_posts, ingest_runs");
    const recent = daysAgo(1), start = daysAgo(30), old = daysAgo(31), today = dayOf();
    await bridge.query("insert into commons_ai_uploads(pageid,title,ts,category) values (1,'File:Included',$1,'AI'),(2,'Category:Excluded',$1,'AI'),(3,'File:Today',$2,'AI'),(4,'File:Old',$3,'AI'),(5,'File:Boundary',$4,'AI')", [recent, today, old, start]);
    await bridge.query("insert into osm_daily(day,collection_version,ai_assisted,sampled) values ($1,1,999,999),($1,2,7,100),($2,2,999,999),($3,2,999,999)", [recent, today, old]);
    await bridge.query("insert into github_daily(day,agent,tier,prs) values ($1,'copilot','bot-account',4),($2,'copilot','bot-account',999),($3,'codex-branch','branch-prefix',2)", [recent,today,start]);
    await bridge.query("insert into visits(ts,day,path,method,ua,agent_slug,category,verified,signed,ip_prefix,signature_agent) values ($1,$2,'/private/PRIVATE_QA_SENTINEL','GET','PRIVATE_QA_SENTINEL','gptbot','ai-training-crawler',true,true,'PRIVATE_QA_SENTINEL','PRIVATE_QA_SENTINEL'),($1,$2,'/','GET','test','gptbot','ai-training-crawler',false,false,null,null),($1,$2,'/','GET','test','gptbot','ai-training-crawler',null,false,null,null),($1,$2,'/','GET','test',null,'search-engine',null,true,null,null),($3,$4,'/','GET','test','gptbot','ai-training-crawler',true,false,null,null)", [recent+"T12:00:00Z",recent,today+"T01:00:00Z",today]);
});

describe("dashboard aggregates against isolated PostgreSQL", () => {
  it("excludes the current day, non-files, legacy map samples, and ordinary bots", async () => {
    const data = await getFlowData();
    expect(data).toMatchObject({mode:"observed",days:30,windowStart:daysAgo(30),windowEnd:dayOf()});
    expect(data.sources.find(s => s.id === "wiki:commons")).toMatchObject({total:2,unit:"files",observedDays:2});
    expect(data.sources.find(s => s.id === "maps:ai")).toMatchObject({total:7,observedDays:1});
    expect(data.sources.find(s => s.id === "gh:copilot")).toMatchObject({total:4,evidence:"Documented bot account"});
    expect(data.sources.find(s => s.id === "gh:codex-branch")).toMatchObject({total:2,evidence:"Branch-name heuristic"});
    expect(data.sources.some(s => s.feed === "visits")).toBe(false);
    expect(data.targets.some(t => t.id === "site")).toBe(false);
    const records = await getLatestRecords();
    expect(records.some(r => r.kind === "visit")).toBe(false);
    const serialized = JSON.stringify({data, records});
    expect(serialized).not.toContain("PRIVATE_QA_SENTINEL");
    expect(serialized).not.toMatch(/ipPrefix|signatureAgent|referer|trapToken|agentSlug/);
  });
  it("retains recorded counts when a source refresh fails and reports incomplete coverage", async () => {
    await bridge.query("insert into ingest_runs(source,started_at,finished_at,ok,stats) values ('osm',now()-interval '2 minutes',now()-interval '1 minute',false,'{\"outcome\":\"partial\"}'),('github',now()-interval '4 minutes',now()-interval '3 minutes',false,'{\"outcome\":\"failed\"}')");
    const data = await getFlowData();
    expect(data.feeds.find(f => f.key === "osm")).toMatchObject({outcome:"partial",stale:false});
    expect(data.feeds.find(f => f.key === "github")).toMatchObject({outcome:"failed",stale:false});
    expect(data.feeds.some(f => f.key === "visits")).toBe(false);
    expect(data.sources.find(s => s.id === "maps:ai")?.total).toBe(7);
  });
  it("keeps matches outside the six largest coding series in an explicit remainder", async () => {
    for (let i = 1; i <= 7; i++) {
      await bridge.query("insert into github_daily(day,agent,tier,prs) values ($1,$2,'bot-account',$3)", [daysAgo(1),"qa-agent-"+i,i*100]);
    }
    const data = await getFlowData();
    const coding = data.sources.filter(s => s.feed === "github");
    expect(coding).toHaveLength(7);
    expect(coding.reduce((sum,s) => sum + s.total, 0)).toBe(2806);
    expect(coding.find(s => s.id === "gh:other")).toMatchObject({total:106,observedDays:2});
  });
});
