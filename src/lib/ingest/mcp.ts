import { sql, type SQL } from "drizzle-orm";
import { fetchJson, type Job, timeLeft } from "./common";
import { commitCollectorState, readCollectorState, type StateSnapshot } from "./state";

const API = "https://registry.modelcontextprotocol.io/v0.1/servers";
export const MCP_STATE_KEY = "mcp";
export interface McpState extends Record<string, unknown> {
  version: 2;
  watermark: string | null;
  scanStartedAt: string | null;
  nextCursor: string | null;
  initialComplete: boolean;
}
export const INITIAL_MCP_STATE: McpState = { version: 2, watermark: null, scanStartedAt: null, nextCursor: null, initialComplete: false };

interface Entry {
  server?: { name?: string; title?: string; description?: string; remotes?: Array<{ url?: string }>; repository?: { url?: string }; websiteUrl?: string };
  _meta?: { "io.modelcontextprotocol.registry/official"?: { publishedAt?: string; updatedAt?: string; status?: string; isLatest?: boolean } };
}
interface Page { servers?: Entry[]; metadata?: { nextCursor?: string; count?: number } }
export interface McpRecord {
  name: string; title: string | null; description: string | null; url: string | null;
  published_at: string | null; updated_at: string; status: string;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function httpUrl(value: string | undefined): string | null {
  if (!value) return null;
  try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) ? u.href : null; } catch { return null; }
}

/** Invalid pages never advance the cursor. Tombstones only require identity and update time. */
export function mcpRecords(entries: Entry[]): McpRecord[] {
  const byName = new Map<string, McpRecord>();
  for (const entry of entries) {
    const s = entry.server;
    const meta = entry._meta?.["io.modelcontextprotocol.registry/official"];
    const updated = meta?.updatedAt ?? meta?.publishedAt;
    if (!s?.name || s.name.length > 200 || !validDate(updated) || !["active", "deprecated", "deleted"].includes(meta?.status ?? "")) throw new Error("invalid MCP registry entry");
    if (meta?.publishedAt && !validDate(meta.publishedAt)) throw new Error("invalid MCP publication date");
    const row: McpRecord = {
      name: s.name, title: s.title?.slice(0, 200) ?? null, description: s.description?.slice(0, 500) ?? null,
      url: httpUrl(s.remotes?.[0]?.url ?? s.repository?.url ?? s.websiteUrl),
      published_at: meta?.publishedAt ?? null, updated_at: updated, status: meta!.status!,
    };
    const previous = byName.get(row.name);
    if (!previous || Date.parse(row.updated_at) >= Date.parse(previous.updated_at)) byName.set(row.name, row);
  }
  return [...byName.values()];
}

export function mcpPageWrite(records: McpRecord[], guard: SQL): SQL {
  return sql`insert into mcp_servers (name, title, description, url, published_at, updated_at, status, sync_version)
    select name, title, description, url, published_at, updated_at, status, 2
    from jsonb_to_recordset(${JSON.stringify(records)}::jsonb) as r(name text, title text, description text, url text, published_at timestamptz, updated_at timestamptz, status text)
    where ${guard}
    on conflict (name) do update set
      title = excluded.title, description = excluded.description, url = excluded.url,
      published_at = least(mcp_servers.published_at, excluded.published_at),
      updated_at = excluded.updated_at, status = excluded.status, sync_version = 2
    where mcp_servers.sync_version < 2 or mcp_servers.updated_at is null or excluded.updated_at >= mcp_servers.updated_at`;
}

export function nextMcpState(state: McpState, scanStartedAt: string, nextCursor: string | null): McpState {
  if (nextCursor) return { ...state, scanStartedAt, nextCursor };
  return { version: 2, watermark: new Date(Date.parse(scanStartedAt) - 1000).toISOString(), scanStartedAt: null, nextCursor: null, initialComplete: true };
}

/** Name-ordered pagination uses a fixed lower bound and survives partial invocations. */
export const mcpJob: Job = async (ctx) => {
  let snapshot: StateSnapshot<McpState> = await readCollectorState(ctx.db, MCP_STATE_KEY, INITIAL_MCP_STATE);
  const scanStartedAt = snapshot.state.scanStartedAt ?? new Date().toISOString();
  const stats: Record<string, unknown> = { pages: 0, seen: 0, version: 2 };
  for (let page = 0; page < 80; page++) {
    if (timeLeft(ctx) < 12_000) return { stats, outcome: "partial" };
    const qs = new URLSearchParams({ limit: "100", version: "latest", include_deleted: "true" });
    if (snapshot.state.watermark) qs.set("updated_since", snapshot.state.watermark);
    if (snapshot.state.nextCursor) qs.set("cursor", snapshot.state.nextCursor);
    const { status, body } = await fetchJson<Page>(`${API}?${qs}`, {}, Math.min(20_000, timeLeft(ctx) - 3000));
    if (status !== 200 || !Array.isArray(body?.servers)) throw new Error(`mcp registry ${status}`);
    const records = mcpRecords(body.servers);
    const nextCursor = body.metadata?.nextCursor || null;
    if (nextCursor && nextCursor === snapshot.state.nextCursor) throw new Error("MCP pagination cursor did not advance");
    const next = nextMcpState(snapshot.state, scanStartedAt, nextCursor);
    const committed = await commitCollectorState(ctx.db, MCP_STATE_KEY, snapshot, next, (guard) => records.length ? [mcpPageWrite(records, guard)] : []);
    if (!committed) return { stats: { ...stats, superseded: true }, outcome: "partial" };
    stats.pages = Number(stats.pages) + 1;
    stats.seen = Number(stats.seen) + records.length;
    stats.initialComplete = next.initialComplete;
    snapshot = { state: next, revision: snapshot.revision + 1 };
    if (!nextCursor) return { stats, outcome: "success" };
  }
  return { stats, outcome: "partial" };
};
