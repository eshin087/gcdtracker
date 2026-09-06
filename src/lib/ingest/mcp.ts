import { sql } from "drizzle-orm";
import { mcpServers } from "@/lib/db/schema";
import { fetchJson, type Job, lastCursor, timeLeft } from "./common";

const API = "https://registry.modelcontextprotocol.io/v0/servers";

interface Entry {
  server?: { name?: string; title?: string; description?: string; remotes?: Array<{ url?: string }>; repository?: { url?: string }; websiteUrl?: string };
  _meta?: { "io.modelcontextprotocol.registry/official"?: { publishedAt?: string; updatedAt?: string; status?: string; isLatest?: boolean } };
}
interface Page {
  servers?: Entry[];
  metadata?: { nextCursor?: string; count?: number };
}

/** Incremental sync of the official MCP registry (supply side of agent tooling). */
export const mcpJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = { pages: 0, seen: 0, upserted: 0 };
  let partial = false;
  const since = await lastCursor(ctx.db, "mcp");
  let cursor: string | undefined;
  let newest = since;

  for (let page = 0; page < 20; page++) {
    if (timeLeft(ctx) < 10_000) {
      partial = true;
      break;
    }
    const qs = new URLSearchParams({ limit: "100" });
    if (since) qs.set("updated_since", since);
    if (cursor) qs.set("cursor", cursor);
    const { status, body } = await fetchJson<Page>(`${API}?${qs}`);
    if (status !== 200 || !body?.servers) throw new Error(`mcp registry ${status}`);
    stats.pages = (stats.pages as number) + 1;
    const rows = [];
    for (const e of body.servers) {
      const s = e.server;
      const meta = e._meta?.["io.modelcontextprotocol.registry/official"];
      if (!s?.name) continue;
      stats.seen = (stats.seen as number) + 1;
      const updated = meta?.updatedAt ?? meta?.publishedAt ?? null;
      if (updated && (!newest || updated > newest)) newest = updated;
      rows.push({
        name: s.name.slice(0, 200),
        title: s.title?.slice(0, 200) ?? null,
        description: s.description?.slice(0, 500) ?? null,
        url: s.remotes?.[0]?.url ?? s.repository?.url ?? s.websiteUrl ?? null,
        publishedAt: meta?.publishedAt ? new Date(meta.publishedAt) : null,
        updatedAt: updated ? new Date(updated) : null,
      });
    }
    if (rows.length > 0) {
      await ctx.db
        .insert(mcpServers)
        .values(rows)
        .onConflictDoUpdate({
          target: mcpServers.name,
          set: { title: sql`excluded.title`, description: sql`excluded.description`, url: sql`excluded.url`, updatedAt: sql`excluded.updated_at` },
        });
      stats.upserted = (stats.upserted as number) + rows.length;
    }
    cursor = body.metadata?.nextCursor;
    if (!cursor) break;
  }
  return { stats, cursor: newest, partial };
};
