import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createNeonBridge, requireQaDatabaseUrl, type NeonBridge } from "./support/neon-local";

let bridge: NeonBridge;
let guestbook: typeof import("../src/app/api/guestbook/route");
let exportsRoute: typeof import("../src/app/api/export/[name]/route");

beforeAll(async () => {
  bridge = await createNeonBridge();
  vi.stubEnv("IP_HASH_SECRET", "qa-only-secret");
  vi.doMock("@/lib/db", () => ({ db: bridge.db }));
  guestbook = await import("../src/app/api/guestbook/route");
  exportsRoute = await import("../src/app/api/export/[name]/route");
});
beforeEach(async () => {
  await bridge.query("truncate guestbook_notes restart identity");
});
afterAll(async () => {
  if (bridge) {
    await bridge.query("truncate guestbook_notes restart identity");
    await bridge.close();
  }
  vi.doUnmock("@/lib/db");
  vi.unstubAllEnvs();
});

function request(ip = "203.0.113.5", extraHeaders: Record<string, string> = {}) {
  return new Request("https://qa.invalid/api/guestbook", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "ChatGPT-User/1.0", "x-forwarded-for": ip, ...extraHeaders },
    body: JSON.stringify({ name: "QA agent", operator: "QA", purpose: "Automated regression", note: "Local QA fixture" }),
  });
}
async function noteCount() {
  return Number((await bridge.query("select count(*)::int as count from guestbook_notes")).rows[0].count);
}

describe("actual guestbook PostgreSQL transaction behavior", () => {
  it("admits exactly one of twenty simultaneous posts from a network", async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => guestbook.POST(request("203.0.113." + (i + 1)))));
    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(19);
    expect(await noteCount()).toBe(1);
    for (const res of responses.filter((res) => res.status === 429)) expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("admits exactly one of twenty networks when the rolling daily total is 49", async () => {
    await bridge.query("insert into guestbook_notes (name,note,ua,ip_prefix,ts) select 'seed','seed','QA','198.51.' || n || '.0/24',now()-interval '2 hours' from generate_series(1,49) n");
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => guestbook.POST(request("203.0." + i + ".5"))));
    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    expect(responses.filter((res) => res.status === 429)).toHaveLength(19);
    expect(await noteCount()).toBe(50);
    for (const res of responses.filter((res) => res.status === 429)) expect((await res.json()).reason).toBe("daily-limit");
  });

  it("takes the quota snapshot after a contending transaction commits", async () => {
    const client = await bridge.pool.connect();
    let pending: Promise<Response> | undefined;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(731847, 1)");
      await client.query("insert into guestbook_notes (name,note,ua,ip_prefix) values ('held','held','QA','203.0.113.0/24')");
      pending = guestbook.POST(request());
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline) {
        const result = await bridge.query("select count(*)::int as count from pg_stat_activity where datname=current_database() and wait_event='advisory'");
        if (Number(result.rows[0].count) > 0) { blocked = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await client.query("commit");
      expect((await pending).status).toBe(429);
      expect(await noteCount()).toBe(1);
    } finally {
      await client.query("rollback");
      client.release();
      if (pending) await pending;
    }
  });

  it("rolls back an entire Neon HTTP batch after an injected SQL failure", async () => {
    await expect(bridge.db.batch([
      bridge.db.execute(sql`select pg_advisory_xact_lock(731847, 1)`),
      bridge.db.execute(sql`insert into guestbook_notes (name,note,ua,ip_prefix) values ('rollback','rollback','QA','203.0.113.0/24')`),
      bridge.db.execute(sql`select 1 / 0`),
    ])).rejects.toThrow();
    expect(await noteCount()).toBe(0);
    expect((await guestbook.POST(request())).status).toBe(201);
  });

  it("shares quotas between equivalent IPv6 addresses and IPv4-mapped addresses", async () => {
    expect((await guestbook.POST(request("2001:db8:abcd::1"))).status).toBe(201);
    expect((await guestbook.POST(request("2001:0DB8:ABCD:0000:0000:0000:0000:0002"))).status).toBe(429);
    expect((await guestbook.POST(request("192.0.2.4"))).status).toBe(201);
    expect((await guestbook.POST(request("::ffff:c000:205"))).status).toBe(429);
    expect(await noteCount()).toBe(2);
  });

  it("counts hidden notes against quotas and expires old notes", async () => {
    await bridge.query("insert into guestbook_notes (name,note,ua,ip_prefix,hidden) values ('hidden','hidden','QA','203.0.113.0/24',true)");
    expect((await guestbook.POST(request())).status).toBe(429);
    await bridge.query("update guestbook_notes set ts=now()-interval '25 hours'");
    expect((await guestbook.POST(request())).status).toBe(201);
  });
});

describe("public endpoints with private PostgreSQL evidence", () => {
  it("rejects forged signature-only identity without writing a row", async () => {
    const res = await guestbook.POST(request("203.0.113.5", {
      "user-agent": "Mozilla/5.0", "signature-agent": "https://qa-forged.example", "signature-input": "x", signature: "x",
    }));
    expect(res.status).toBe(403);
    expect(await noteCount()).toBe(0);
  });

  it("publishes safe guestbook fields and reports signatures as unverified", async () => {
    expect((await guestbook.POST(request("203.0.113.5", {
      "signature-agent": "https://qa-private-signature.example", "signature-input": "x", signature: "x",
    }))).status).toBe(201);
    const privateRow = (await bridge.query("select * from guestbook_notes")).rows[0];
    expect(privateRow.signature_agent).toBe("qa-private-signature.example");
    expect(privateRow.ip_prefix).toBe("203.0.113.0/24");
    const api = await guestbook.GET();
    const payload = await api.json();
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toMatchObject({ agent: "chatgpt-user", signed: true, signatureStatus: "unverified" });
    for (const field of ["ua", "ip_prefix", "ipPrefix", "signature_agent", "signatureAgent", "hidden"]) expect(payload.notes[0]).not.toHaveProperty(field);
    expect(JSON.stringify(payload)).not.toMatch(/203\.0\.113|qa-private-signature/);
  });

  it("does not export stored header-derived identities, raw headers, network keys or unknown paths", async () => {
    const result = await bridge.query(
      "insert into visits (day,path,method,ua,agent_slug,agent_name,operator,category,signed,signature_agent,ip_prefix,ip_hash,referer,robots_violation,trap_token) values (current_date,$1,'GET',$2,$3,$4,$4,'ai-browsing-agent',true,$4,'203.0.113.0/24','qa-private-hash','qa-private-referrer',true,$5) returning id",
      ["/trap/qa-private-token", "=HYPERLINK(qa-private-header)", "signed:qa-private-signature.example", "qa-private-signature.example", "qa-private-token"],
    );
    const id = result.rows[0].id;
    try {
      const response = await exportsRoute.GET(new Request("https://qa.invalid/api/export/visits.csv"), { params: Promise.resolve({ name: "visits.csv" }) });
      const csv = await response.text();
      expect(response.status).toBe(200);
      expect(csv).toContain("signature_status");
      expect(csv).toContain("/trap/[token]");
      expect(csv).not.toMatch(/qa-private-|ip_prefix|ip_hash|signature_agent|referer|trap_token|203\.0\.113/);
      expect(csv).toContain("unverified");
    } finally {
      await bridge.query("delete from visits where id=$1", [id]);
    }
  });

  it("refuses non-QA connection strings before opening any connection", () => {
    for (const url of [
      "postgresql://qa:qa@remote.example/gcdtracker_qa",
      "postgresql://qa:qa@127.0.0.1/production",
      "postgresql://qa:qa@127.0.0.1/gcdtracker_qa?host=remote.example",
    ]) expect(() => requireQaDatabaseUrl(url)).toThrow();
  });
});
