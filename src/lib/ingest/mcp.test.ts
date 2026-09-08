import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { INITIAL_MCP_STATE, mcpPageWrite, mcpRecords, nextMcpState } from "./mcp";

const entry = (updatedAt: string, status = "active", url = "https://example.com/mcp") => ({
  server: { name: "org.example/server", title: updatedAt, remotes: [{ url }] },
  _meta: { "io.modelcontextprotocol.registry/official": { updatedAt, publishedAt: "2026-01-01T00:00:00Z", status } },
});
describe("MCP checkpoints and records", () => {
  it("keeps a fixed traversal bound across partial pages and advances to its start only after exhaustion", () => {
    const started = "2026-09-07T12:00:00.000Z";
    const first = nextMcpState(INITIAL_MCP_STATE, started, "name:page2");
    expect(first).toEqual({ ...INITIAL_MCP_STATE, scanStartedAt: started, nextCursor: "name:page2" });
    const second = nextMcpState(first, started, "name:page3");
    expect(second.watermark).toBeNull();
    const done = nextMcpState(second, started, null);
    expect(done.watermark).toBe("2026-09-07T11:59:59.000Z");
    expect(done.initialComplete).toBe(true);
    expect(done.nextCursor).toBeNull();
    expect(done.scanStartedAt).toBeNull();
  });
  it("deduplicates out-of-order versions and retains deletion tombstones", () => {
    const rows = mcpRecords([entry("2026-09-06T00:00:00Z", "deleted"), entry("2026-09-01T00:00:00Z")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("deleted");
  });
  it("rejects malformed entries without manufacturing update timestamps", () => {
    expect(() => mcpRecords([entry("not-a-date")])).toThrow("invalid MCP");
    expect(() => mcpRecords([entry("2026-09-01T00:00:00Z", "unexpected")])).toThrow("invalid MCP");
  });
  it("does not retain executable remote URLs", () => {
    expect(mcpRecords([entry("2026-09-01T00:00:00Z", "active", "javascript:alert(1)")])[0].url).toBeNull();
  });
  it("guards the SQL page write and prevents stale metadata overwrites", () => {
    const q = new PgDialect().sqlToQuery(mcpPageWrite(mcpRecords([entry("2026-09-01T00:00:00Z")]), sql`revision = ${3}`));
    expect(q.sql).toContain("where revision = $");
    expect(q.sql).toContain("excluded.updated_at >= mcp_servers.updated_at");
    expect(q.params).toContain(3);
    expect(q.sql).not.toContain("org.example/server");
  });
});
