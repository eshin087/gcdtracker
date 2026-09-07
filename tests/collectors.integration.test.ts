import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { createNeonBridge } from "./support/neon-local";
import { ARCHIVE_TOTAL_KEYS, archiveReplacementStatements, ghArchiveJob, type HourRecord } from "../src/lib/ingest/gharchive";
import { commitOsmSamples, osmSample, type OsmSample } from "../src/lib/ingest/osm";
import { commitCollectorState, readCollectorState } from "../src/lib/ingest/state";
import { mcpPageWrite, type McpRecord } from "../src/lib/ingest/mcp";
import { archiveDailyQuery, archiveMonthlyQuery, archiveShareQuery, archiveShareRow, archiveAgentsQuery, foldArchiveRows, isComparableArchivePeriod, type ArchiveRaw } from "../src/lib/stats-census";
import { resultRows } from "../src/lib/ingest/state";
import { commitSeries } from "../src/lib/ingest/series-write";
import { baselineJob } from "../src/lib/ingest/baseline";
import { watchedPageWrites, prRecord } from "../src/lib/ingest/watched";
import { GITHUB_AGENTS } from "../src/lib/github/agents";
import type { SearchItem } from "../src/lib/ingest/github";

let bridge: Awaited<ReturnType<typeof createNeonBridge>>;
beforeAll(async () => { bridge = await createNeonBridge(); });
afterAll(async () => { await bridge?.close(); });
beforeEach(async () => {
  await bridge.query("truncate gh_archive_hourly, gh_archive_daily, gh_archive_completed, osm_sample_seen, osm_daily, osm_changesets, mcp_servers, watched_prs, watched_signals, watched_repos");
  await bridge.query("delete from collector_state where key like 'qa-%'");
  await bridge.query("delete from external_series where source = 'qa-series'");
});

async function batch(statements: SQL[]) {
  const queries = statements.map((s) => bridge.db.execute(s));
  return bridge.db.batch(queries as [typeof queries[number], ...typeof queries]);
}
function archiveHour(hour = "2026-09-06T01", prs = 10, agentCount = 2, agent = "claude"): HourRecord {
  const values: Record<string, number> = { events: 100, prs_opened: prs, prs_merged: 0, pushes: 0, pushes_with_commits: 0, commits: 0, prs_with_body: prs };
  return { hour, rows: [...ARCHIVE_TOTAL_KEYS.map((key) => ({ kind: "total", key, value: values[key] })), ...(agentCount ? [{ kind: "agent-prs", key: agent, value: agentCount }] : [])] };
}
async function ingest(hours: HourRecord[]) {
  return ghArchiveJob({ db: bridge.db, deadline: Date.now() + 30_000, payload: JSON.stringify({ ingestVersion: 2, hours }) });
}
function sample(id: number, ai = true): OsmSample {
  return osmSample({ id, created_at: "2026-09-06T01:00:00Z", closed_at: "2026-09-06T02:00:00Z", open: false, tags: ai ? { created_by: "Rapid 2.0" } : {} }, new Date("2026-09-05T00:00:00Z"), new Date("2026-09-07T00:00:00Z"))!;
}
function server(title: string, updated = "2026-09-06T00:00:00Z", status = "active"): McpRecord {
  return { name: "qa.test/mcp", title, description: null, url: null, updated_at: updated, published_at: "2026-01-01T00:00:00Z", status };
}

describe("Neon HTTP collector transactions against isolated PostgreSQL", () => {
  it("replaces an hour completely, removes obsolete sparse keys, and replays without inflation", async () => {
    await ingest([archiveHour()]);
    await ingest([archiveHour()]);
    expect((await bridge.query("select value from gh_archive_daily where kind='agent-prs'")).rows).toEqual([{ value: 2 }]);
    await ingest([archiveHour(undefined, 10, 0)]);
    expect((await bridge.query("select * from gh_archive_hourly where kind='agent-prs'")).rowCount).toBe(0);
    expect((await bridge.query("select * from gh_archive_daily where kind='agent-prs'")).rowCount).toBe(0);
    expect((await bridge.query("select hour,ingest_version from gh_archive_completed")).rows).toEqual([{ hour: "2026-09-06T01", ingest_version: 2 }]);
  });

  it("keeps daily rollups correct when different shards write the same day concurrently", async () => {
    await Promise.all([ingest([archiveHour("2026-09-06T01", 10, 2)]), ingest([archiveHour("2026-09-06T02", 20, 3)])]);
    expect((await bridge.query("select value,hours from gh_archive_daily where kind='total' and key='prs_opened'")).rows).toEqual([{ value: 30, hours: 2 }]);
    expect((await bridge.query("select value,hours from gh_archive_daily where kind='agent-prs'")).rows).toEqual([{ value: 5, hours: 2 }]);
    expect((await bridge.query("select count(*)::int as n from gh_archive_completed")).rows[0].n).toBe(2);
  });

  it("serializes competing replacements instead of retaining a union of obsolete keys", async () => {
    await Promise.all([ingest([archiveHour(undefined, 10, 2, "claude")]), ingest([archiveHour(undefined, 10, 3, "codex-branch")])]);
    const hourly = (await bridge.query("select key,value from gh_archive_hourly where kind='agent-prs'")).rows;
    expect(hourly).toHaveLength(1);
    expect([2, 3]).toContain(hourly[0].value);
    expect((await bridge.query("select key,value from gh_archive_daily where kind='agent-prs'")).rows).toEqual(hourly);
  });

  it("rolls back hourly replacement, daily totals, and completion together on failure", async () => {
    await ingest([archiveHour()]);
    const statements = archiveReplacementStatements([archiveHour(undefined, 20, 4)]);
    statements.splice(statements.length - 1, 0, sql`select 1 / 0`);
    await expect(batch(statements)).rejects.toThrow();
    expect((await bridge.query("select value from gh_archive_hourly where kind='agent-prs'")).rows).toEqual([{ value: 2 }]);
    expect((await bridge.query("select value from gh_archive_daily where kind='total' and key='prs_opened'")).rows).toEqual([{ value: 10 }]);
    const fresh = archiveReplacementStatements([archiveHour("2026-09-06T03")]);
    fresh.splice(fresh.length - 1, 0, sql`select 1 / 0`);
    await expect(batch(fresh)).rejects.toThrow();
    expect((await bridge.query("select * from gh_archive_completed where hour='2026-09-06T03'")).rowCount).toBe(0);
  });

  it("does not certify legacy or incomplete stored hours during missing-hour detection", async () => {
    await bridge.query("insert into gh_archive_hourly(hour,kind,key,value) values('2026-09-06T01','total','events',100)");
    const report = await ghArchiveJob({ db: bridge.db, deadline: Date.now() + 30_000, query: new URLSearchParams({ from: "2026-09-06T01", to: "2026-09-06T01" }) });
    expect(report.stats.missing).toEqual(["2026-09-06T01"]);
  });

  it("deduplicates concurrent OSM overlap and retains accurate denominators/editor totals", async () => {
    await bridge.query("insert into osm_daily(day,sampled,ai_assisted,collection_version) values('2026-09-06',999,999,1)");
    await Promise.all([commitOsmSamples(bridge.db, [sample(1), sample(2)]), commitOsmSamples(bridge.db, [sample(2), sample(3, false)])]);
    expect(await commitOsmSamples(bridge.db, [sample(1), sample(2), sample(3, false)])).toEqual({ inserted: 0, ai: 0 });
    const rows = (await bridge.query("select collection_version,sampled,ai_assisted,by_editor from osm_daily order by collection_version")).rows;
    expect(rows[0]).toMatchObject({ collection_version: 1, sampled: 999, ai_assisted: 999 });
    expect(rows[1]).toMatchObject({ collection_version: 2, sampled: 3, ai_assisted: 2, by_editor: { Rapid: 2 } });
    expect((await bridge.query("select count(*)::int as n from osm_sample_seen")).rows[0].n).toBe(3);
    expect((await bridge.query("select count(*)::int as n from osm_changesets where collection_version=2")).rows[0].n).toBe(2);
  });

  it("commits exactly one competing checkpoint and its corresponding page data", async () => {
    const snapshot = await readCollectorState(bridge.db, "qa-mcp", { cursor: null as string | null });
    const committed = await Promise.all([
      commitCollectorState(bridge.db, "qa-mcp", snapshot, { cursor: "a" }, (guard) => [mcpPageWrite([server("a")], guard)]),
      commitCollectorState(bridge.db, "qa-mcp", snapshot, { cursor: "b" }, (guard) => [mcpPageWrite([server("b")], guard)]),
    ]);
    expect(committed.sort()).toEqual([false, true]);
    const current = await readCollectorState(bridge.db, "qa-mcp", { cursor: null as string | null });
    expect(current.revision).toBe(1);
    expect((await bridge.query("select title from mcp_servers")).rows[0].title).toBe(current.state.cursor);
  });

  it("rolls back checkpoint advancement when the page write fails", async () => {
    const snapshot = await readCollectorState(bridge.db, "qa-mcp", { cursor: null as string | null });
    await expect(commitCollectorState(bridge.db, "qa-mcp", snapshot, { cursor: "next" }, (guard) => [mcpPageWrite([server("new")], guard), sql`select 1 / 0`])).rejects.toThrow();
    expect((await readCollectorState(bridge.db, "qa-mcp", { cursor: null as string | null })).revision).toBe(0);
    expect((await bridge.query("select count(*)::int as n from mcp_servers")).rows[0].n).toBe(0);
  });

  it("reconciles legacy version metadata before applying monotonic updates", async () => {
    await bridge.query("insert into mcp_servers(name,title,updated_at) values('qa.test/mcp','legacy arbitrary version','2026-09-09T00:00:00Z')");
    await batch([mcpPageWrite([server("registry latest", "2026-09-06T00:00:00Z")], sql`true`)]);
    expect((await bridge.query("select title,sync_version from mcp_servers")).rows).toEqual([{ title: "registry latest", sync_version: 2 }]);
  });

  it("prevents older MCP metadata from overwriting a newer entry and applies deletion updates", async () => {
    await batch([mcpPageWrite([server("new", "2026-09-06T00:00:00Z")], sql`true`)]);
    await batch([mcpPageWrite([server("old", "2026-09-01T00:00:00Z", "deleted")], sql`true`)]);
    expect((await bridge.query("select title,status from mcp_servers")).rows).toEqual([{ title: "new", status: "active" }]);
    await batch([mcpPageWrite([server("removed", "2026-09-07T00:00:00Z", "deleted")], sql`true`)]);
    expect((await bridge.query("select title,status,sync_version from mcp_servers")).rows).toEqual([{ title: "removed", status: "deleted", sync_version: 2 }]);
  });
});

describe("read-side coverage and additional checkpoint transactions", () => {
  it("executes grouped completion queries and excludes legacy, incomplete, thin and current days from shares and rankings", async () => {
    const fixtures = [
      { day: "2026-08-27", hours: 24, validated: 24, prs: 48000, agent: 480 },
      { day: "2026-08-28", hours: 24, validated: 0, prs: 48000, agent: 999 },
      { day: "2026-08-29", hours: 23, validated: 23, prs: 48000, agent: 998 },
      { day: "2026-08-30", hours: 24, validated: 24, prs: 100, agent: 99 },
      { day: "2026-09-01", hours: 24, validated: 24, prs: 48000, agent: 997 },
    ];
    for (const row of fixtures) {
      await bridge.query("insert into gh_archive_daily(day,kind,key,value,hours) values($1,'total','events',100000,$2),($1,'total','prs_opened',$3,$2),($1,'agent-prs','claude',$4,$2)", [row.day,row.hours,row.prs,row.agent]);
      for (let h=0; h<row.validated; h++) await bridge.query("insert into gh_archive_completed(hour,ingest_version) values($1,2)", [row.day+"T"+String(h).padStart(2,"0")]);
    }
    const daily = foldArchiveRows(resultRows<ArchiveRaw>(await bridge.db.execute(archiveDailyQuery("2026-08-01"))));
    expect(daily.map((row) => row.validatedHours)).toEqual([24,0,23,24,24]);
    expect(daily.filter((row) => isComparableArchivePeriod(row,"2026-09-01")).map((row) => row.period)).toEqual(["2026-08-27"]);
    const monthly = foldArchiveRows(resultRows<ArchiveRaw>(await bridge.db.execute(archiveMonthlyQuery())));
    expect(monthly[0]).toMatchObject({period:"2026-08",hours:95,validatedHours:71,partialFeed:true});
    expect(isComparableArchivePeriod(monthly[0],"2026-09-01")).toBe(false);
    const shares = resultRows<{ day: string; hours: number; validatedHours: number; prs: number; agent: number }>(await bridge.db.execute(archiveShareQuery())).map((row) => archiveShareRow(row,"2026-09-01"));
    expect(shares.map((row) => row.share)).toEqual([0.01,null,null,null,null]);
    const ranked = resultRows<{kind:string;key:string;value:string}>(await bridge.db.execute(archiveAgentsQuery("2026-08-01","2026-09-01")));
    expect(ranked).toEqual([{kind:"agent-prs",key:"claude",value:"480"}]);
  });

  it("commits only the series values belonging to the winning checkpoint revision", async () => {
    const snapshot = await readCollectorState(bridge.db,"qa-series",{nextFrom:"2026-08-01"});
    const results = await Promise.all([1,2].map((value) => commitSeries(bridge.db,"qa-series",snapshot,{nextFrom:"2026-08-0"+(value+1)},[
      {source:"qa-series",series:"package",period:"2026-08-01",value},
    ])));
    expect(results.sort()).toEqual([false,true]);
    const state = await readCollectorState(bridge.db,"qa-series",{nextFrom:""});
    const value = Number(state.state.nextFrom.slice(-1))-1;
    expect((await bridge.query("select value from external_series where source='qa-series'")).rows).toEqual([{value}]);
  });

  it("atomically rolls back watched PRs, signals, summary and checkpoint on a failed page", async () => {
    const repo="qa/repo", now=new Date("2026-09-01T00:00:00Z");
    await bridge.query("insert into watched_repos(repo) values($1)",[repo]);
    const bot=GITHUB_AGENTS.find((agent) => agent.id !== undefined)!;
    const item = {id:123,user:{id:bot.id!,login:"agent"},title:"QA PR",html_url:"https://github.com/qa/repo/pull/1",repository_url:"https://api.github.com/repos/qa/repo",number:1,state:"open",created_at:"2026-08-31T00:00:00Z",updated_at:"2026-08-31T01:00:00Z"} satisfies SearchItem;
    const record=prRecord(item,repo,now)!;
    // Include a candidate evidence row to exercise the separate signals statement.
    record.signals=[{id:"qa-signal",activityId:record.pr.id,ruleId:"qa-rule",excerpt:"QA",url:item.html_url}];
    const snap=await readCollectorState(bridge.db,"qa-watched",{pending:true});
    const writes=(guard:SQL)=>watchedPageWrites(repo,[record],now.toISOString(),now,guard);
    await expect(commitCollectorState(bridge.db,"qa-watched",snap,{pending:false},(guard)=>[...writes(guard),sql`select 1/0`])).rejects.toThrow();
    expect((await bridge.query("select count(*)::int as n from watched_prs")).rows[0].n).toBe(0);
    expect((await bridge.query("select count(*)::int as n from watched_signals")).rows[0].n).toBe(0);
    expect((await bridge.query("select last_polled_at,pr_count_30d from watched_repos")).rows).toEqual([{last_polled_at:null,pr_count_30d:0}]);
    expect(await commitCollectorState(bridge.db,"qa-watched",snap,{pending:false},writes)).toBe(true);
    expect(await commitCollectorState(bridge.db,"qa-watched",snap,{pending:false},writes)).toBe(false);
    expect((await bridge.query("select count(*)::int as n from watched_prs")).rows[0].n).toBe(1);
    expect((await bridge.query("select count(*)::int as n from watched_signals")).rows[0].n).toBe(1);
    expect((await bridge.query("select pr_count_30d from watched_repos")).rows).toEqual([{pr_count_30d:1}]);
    expect((await readCollectorState(bridge.db,"qa-watched",{pending:true})).state.pending).toBe(false);
  });
});

describe("baseline source resumption", () => {
  it("continues after one source fails and honors Stack Exchange backoff across runs", async () => {
    await bridge.query("delete from collector_state where key like 'baseline:%'");
    await bridge.query("delete from external_series where source in ('stackoverflow','wm-pageviews','statcounter')");
    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)-1).toISOString().slice(0,7);
    const realFetch=globalThis.fetch, calls:string[]=[];
    const fixtureFetch:typeof fetch=async(input,init)=>{
      const url=String(input);
      if(url===bridge.endpoint) return realFetch(input,init);
      calls.push(url);
      if(url.includes("wikimedia.org")) {
        if(url.includes("/all-projects/all-access/user/")) return Response.json({error:"fixture"},{status:503});
        return Response.json({items:[{timestamp:end.replace("-","")+"0100",views:10}]});
      }
      if(url.includes("api.stackexchange.com")) return Response.json({total:100,backoff:3600});
      if(url.includes("gs.statcounter.com")) return new Response("Date,Google,Bing\n"+end+",95,5");
      throw new Error("Unexpected outbound test URL");
    };
    vi.stubGlobal("fetch",fixtureFetch);
    try {
      const first=await baselineJob({db:bridge.db,deadline:Date.now()+60000});
      expect(first.outcome).toBe("failed");
      expect(first.stats.wmRows).toBe(5);
      expect(first.stats.statcounterRows).toBe(2);
      expect(first.stats.soRows).toBe(1);
      const so = await readCollectorState(bridge.db,"baseline:stackoverflow",{backoffUntil:null as string|null});
      expect(Date.parse(so.state.backoffUntil!)).toBeGreaterThan(Date.now());
      const checkpoint=await readCollectorState(bridge.db,"baseline:wm:all-projects:user",{initialized:false,refreshedMonth:""});
      expect(checkpoint.state.initialized).toBe(false);
      await baselineJob({db:bridge.db,deadline:Date.now()+60000});
      expect(calls.filter((url)=>url.includes("api.stackexchange.com"))).toHaveLength(1);
      expect(calls.filter((url)=>url.includes("gs.statcounter.com"))).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
      await bridge.query("delete from collector_state where key like 'baseline:%'");
      await bridge.query("delete from external_series where source in ('stackoverflow','wm-pageviews','statcounter')");
    }
  });
});
