import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "../src/lib/db";
import { createNeonBridge } from "./support/neon-local";
import { dayOf, daysAgo } from "../src/lib/format";

const state = vi.hoisted(() => ({ db: null as Db | null }));
vi.mock("../src/lib/db", () => ({ get db() { return state.db; } }));
import { getFlowData } from "../src/lib/stats-sources";

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
beforeAll(async () => {
  bridge = await createNeonBridge();
  state.db = bridge.db;
  await bridge.query("truncate visits, github_daily, wiki_edits, wikidata_bot_edits, commons_ai_uploads, osm_daily, forum_posts, ingest_runs");
});
afterAll(async () => { state.db = null; await bridge?.close(); });

describe("dashboard aggregates against isolated PostgreSQL", () => {
  it("excludes the current day, non-files, legacy map samples, and ordinary bots", async () => {
    const recent = daysAgo(1), start = daysAgo(30), old = daysAgo(31), today = dayOf();
    await bridge.query("insert into commons_ai_uploads(pageid,title,ts,category) values (1,'File:Included',$1,'AI'),(2,'Category:Excluded',$1,'AI'),(3,'File:Today',$2,'AI'),(4,'File:Old',$3,'AI'),(5,'File:Boundary',$4,'AI')", [recent, today, old, start]);
    await bridge.query("insert into osm_daily(day,collection_version,ai_assisted,sampled) values ($1,1,999,999),($1,2,7,100),($2,2,999,999),($3,2,999,999)", [recent, today, old]);
    await bridge.query("insert into github_daily(day,agent,tier,prs) values ($1,'copilot','bot-account',4),($2,'copilot','bot-account',999),($3,'codex-branch','branch-prefix',2)", [recent,today,start]);
    await bridge.query("insert into visits(ts,day,path,method,ua,agent_slug,category,verified,signed,ip_prefix,signature_agent) values ($1,$2,'/private/PRIVATE_QA_SENTINEL','GET','PRIVATE_QA_SENTINEL','gptbot','ai-training-crawler',true,true,'PRIVATE_QA_SENTINEL','PRIVATE_QA_SENTINEL'),($1,$2,'/','GET','test','gptbot','ai-training-crawler',false,false,null,null),($1,$2,'/','GET','test','gptbot','ai-training-crawler',null,false,null,null),($1,$2,'/','GET','test',null,'search-engine',null,true,null,null),($3,$4,'/','GET','test','gptbot','ai-training-crawler',true,false,null,null)", [recent+"T12:00:00Z",recent,today+"T01:00:00Z",today]);
    const data = await getFlowData();
    expect(data).toMatchObject({mode:"observed",days:30,windowStart:start,windowEnd:today});
    expect(data.sources.find(s => s.id === "wiki:commons")).toMatchObject({total:2,unit:"files",observedDays:2});
    expect(data.sources.find(s => s.id === "maps:ai")).toMatchObject({total:7,observedDays:1});
    expect(data.sources.find(s => s.id === "gh:copilot")).toMatchObject({total:4,evidence:"Documented bot account"});
    expect(data.sources.find(s => s.id === "gh:codex-branch")).toMatchObject({total:2,evidence:"Branch-name heuristic"});
    expect(data.sources.find(s => s.id === "web:ai-training-crawler")).toMatchObject({
      total:3,observedDays:1,verification:{matched:1,checkable:2,requests:3,signatureHeaders:1},
    });
    expect(data.sources.filter(s => s.feed === "visits")).toHaveLength(1);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("PRIVATE_QA_SENTINEL");
    expect(serialized).not.toMatch(/ipPrefix|signatureAgent|referer|trapToken|agentSlug/);
  });
  it("retains recorded counts when a source refresh fails and reports incomplete coverage", async () => {
    await bridge.query("insert into ingest_runs(source,started_at,finished_at,ok,stats) values ('osm',now()-interval '2 minutes',now()-interval '1 minute',false,'{\"outcome\":\"partial\"}'),('github',now()-interval '4 minutes',now()-interval '3 minutes',false,'{\"outcome\":\"failed\"}')");
    const data = await getFlowData();
    expect(data.feeds.find(f => f.key === "osm")).toMatchObject({outcome:"partial",stale:false});
    expect(data.feeds.find(f => f.key === "github")).toMatchObject({outcome:"failed",stale:false});
    expect(data.feeds.find(f => f.key === "visits")).toMatchObject({outcome:"unknown",lastRun:null});
    expect(data.sources.find(s => s.id === "maps:ai")?.total).toBe(7);
  });
});
