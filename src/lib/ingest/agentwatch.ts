import { sql } from "drizzle-orm";
import aiRobots from "../../../data/ai-robots.json";
import { agentSightings, externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job, timeLeft } from "./common";

export const AGENT_WATCH = {
  robots: "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json",
  registry: "https://assets.radar.cloudflare.com/bots/signature-agent-registry.txt",
  hfDaily: "https://datasets-server.huggingface.co/rows?dataset=huggingface%2Fagent-usage&config=daily&split=train",
  hfModels: "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=100",
} as const;

type RobotsEntry = { operator?: string; function?: string; description?: string };

/**
 * Watches for newly published agent identities and quotes Hugging Face's own
 * agent-usage statistics. Every new token or signed-agent directory becomes a sighting.
 */
export const agentWatchJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = {};

  // 1. ai.robots.txt: anything not in our vendored copy is new.
  const known = new Set(Object.keys((aiRobots as { agents: Record<string, unknown> }).agents).map((k) => k.toLowerCase()));
  const r1 = await fetchJson<Record<string, RobotsEntry>>(AGENT_WATCH.robots);
  if (r1.status === 200 && r1.body) {
    const rows = Object.entries(r1.body).map(([token, info]) => ({
      kind: "ai-robots-txt",
      token,
      operator: info.operator ?? null,
      fn: info.function ?? null,
      url: "https://github.com/ai-robots-txt/ai.robots.txt",
    }));
    for (let i = 0; i < rows.length; i += 200) await ctx.db.insert(agentSightings).values(rows.slice(i, i + 200)).onConflictDoNothing();
    stats.robotsTotal = rows.length;
    stats.robotsNewVsVendored = rows.filter((r) => !known.has(r.token.toLowerCase())).length;
  } else {
    stats.robots = `skipped (${r1.status})`;
  }

  // 2. Cloudflare's public registry of agents that sign requests (Web Bot Auth).
  //    The registry blocks some hosting providers, so the scheduler may fetch it and POST the text to us.
  if (timeLeft(ctx) > 15_000) {
    let text: string | null = ctx.payload && ctx.payload.includes("http-message-signatures-directory") ? ctx.payload : null;
    let status = text ? "payload" : "";
    if (!text) {
      const res = await fetch(AGENT_WATCH.registry, {
        headers: { "user-agent": "gcdTracker/0.3 (+https://gcdtracker-site.vercel.app; +https://github.com/eshin087/gcdtracker-site) bot", accept: "text/plain, */*" },
        cache: "no-store",
      });
      status = String(res.status);
      if (res.ok) text = await res.text();
    }
    if (text) {
      const dirs = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("http"));
      const rows = dirs.map((u) => {
        let host = u;
        try {
          host = new URL(u).host;
        } catch {
          /* keep raw */
        }
        return { kind: "signature-registry", token: host, operator: null, fn: "signed agent (Web Bot Auth)", url: u };
      });
      if (rows.length > 0) await ctx.db.insert(agentSightings).values(rows).onConflictDoNothing();
      stats.signedAgents = rows.length;
      stats.registry = status;
    } else {
      stats.registry = `skipped (${status})`;
    }
  }

  // 3. Hugging Face agent-usage dataset (share of Hub requests per coding agent, per day).
  if (timeLeft(ctx) > 15_000) {
    const rows: Array<{ source: string; series: string; period: string; value: number; lo: number | null; hi: number | null }> = [];
    let offset = 0;
    let total = Infinity;
    for (let page = 0; page < 25 && offset < total; page++) {
      const { status, body } = await fetchJson<{ rows?: Array<{ row: { day: string; agent: string; pct_requests: number; pct_users: number } }>; num_rows_total?: number }>(
        `${AGENT_WATCH.hfDaily}&offset=${offset}&length=100`,
      );
      if (status !== 200 || !body?.rows) break;
      total = body.num_rows_total ?? 0;
      for (const { row } of body.rows) {
        rows.push({ source: "hf-agent-usage", series: `${row.agent}:requests`, period: row.day, value: row.pct_requests, lo: null, hi: null });
        rows.push({ source: "hf-agent-usage", series: `${row.agent}:users`, period: row.day, value: row.pct_users, lo: null, hi: null });
      }
      offset += 100;
      if (timeLeft(ctx) < 15_000) break;
    }
    for (let i = 0; i < rows.length; i += 200) {
      await ctx.db
        .insert(externalSeries)
        .values(rows.slice(i, i + 200))
        .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, fetchedAt: new Date() } });
    }
    stats.hfRows = rows.length;
  }

  // 4. Hub creation rate: how many repos were created in the last hour (denominator for agent activity).
  if (timeLeft(ctx) > 10_000) {
    const { status, body } = await fetchJson<Array<{ createdAt?: string }>>(AGENT_WATCH.hfModels);
    if (status === 200 && Array.isArray(body) && body.length > 1) {
      const times = body.map((m) => new Date(m.createdAt ?? 0).getTime()).filter((t) => t > 0);
      const spanMs = Math.max(1, Math.max(...times) - Math.min(...times));
      const perHour = (times.length / spanMs) * 3_600_000;
      const period = new Date().toISOString().slice(0, 13); // hour bucket
      await ctx.db
        .insert(externalSeries)
        .values({ source: "hf-hub", series: "new-models-per-hour", period, value: Math.round(perHour), lo: null, hi: null })
        .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value` } });
      stats.hfNewModelsPerHour = Math.round(perHour);
    }
  }
  return { stats };
};
