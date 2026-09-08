import { sql } from "drizzle-orm";
import aiRobots from "../../../data/ai-robots.json";
import vendoredRegistry from "../../../data/signature-registry.json";
import { agentSightings, externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job, timeLeft } from "./common";

export const AGENT_WATCH = {
  robots: "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json",
  registry: "https://assets.radar.cloudflare.com/bots/signature-agent-registry.txt",
  hfDaily: "https://datasets-server.huggingface.co/rows?dataset=huggingface%2Fagent-usage&config=daily&split=train",
  hfModels: "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=100",
} as const;

type RobotsEntry = { operator?: string; function?: string; description?: string };

function registryRows(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("http")).map((value) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid registry directory URL");
    return { kind: "signature-registry", token: url.host, operator: null, fn: "signed agent (Web Bot Auth)", url: url.href };
  });
}

/** Watches published identities and quotes Hugging Face's own usage statistics. */
export const agentWatchJob: Job = async (ctx) => {
  const stats: Record<string, unknown> = {};
  const failed: string[] = [];
  let partial = false;
  // One unavailable upstream must not hide behind another source's successful refresh.
  async function source(name: string, budget: number, collect: () => Promise<void>) {
    if (timeLeft(ctx) < budget) { partial = true; return; }
    try { await collect(); } catch (error) {
      failed.push(name);
      stats[name] = (error instanceof Error ? error.message : String(error)).slice(0, 160);
    }
  }

  await source("robots", 5_000, async () => {
    const known = new Set(Object.keys((aiRobots as { agents: Record<string, unknown> }).agents).map((k) => k.toLowerCase()));
    const { status, body } = await fetchJson<Record<string, RobotsEntry>>(AGENT_WATCH.robots);
    if (status !== 200 || !body || Array.isArray(body) || typeof body !== "object" || Object.keys(body).length === 0) throw new Error(`robots ${status}: invalid response`);
    const rows = Object.entries(body).map(([token, info]) => {
      if (!info || typeof info !== "object" || (info.operator !== undefined && typeof info.operator !== "string") || (info.function !== undefined && typeof info.function !== "string")) throw new Error("invalid robots entry");
      return { kind: "ai-robots-txt", token, operator: info.operator ?? null, fn: info.function ?? null, url: "https://github.com/ai-robots-txt/ai.robots.txt" };
    });
    for (let i = 0; i < rows.length; i += 200) await ctx.db.insert(agentSightings).values(rows.slice(i, i + 200)).onConflictDoNothing();
    stats.robotsTotal = rows.length;
    stats.robotsNewVsVendored = rows.filter((r) => !known.has(r.token.toLowerCase())).length;
  });

  // A vendored fallback is useful, but it does not establish upstream freshness.
  await source("registry", 15_000, async () => {
    let rows: ReturnType<typeof registryRows>;
    try {
      let text = ctx.payload?.includes("http-message-signatures-directory") ? ctx.payload : null;
      stats.registry = text ? "payload" : "upstream";
      if (!text) {
        const res = await fetch(AGENT_WATCH.registry, {
          headers: { "user-agent": "gcdTracker/0.3 (+https://gcdtracker.vercel.app; +https://github.com/eshin087/gcdtracker-site) bot", accept: "text/plain, */*" },
          cache: "no-store",
          signal: AbortSignal.timeout(Math.min(20_000, Math.max(1, timeLeft(ctx) - 1_000))),
        });
        if (!res.ok) throw new Error(`registry ${res.status}`);
        text = await res.text();
      }
      rows = registryRows(text);
      if (rows.length === 0) throw new Error("registry has no directory URLs");
    } catch (error) {
      failed.push("registry");
      stats.registryError = (error instanceof Error ? error.message : String(error)).slice(0, 160);
      rows = registryRows((vendoredRegistry as { urls: string[] }).urls.join("\n"));
      stats.registry = `vendored ${(vendoredRegistry as { fetchedAt: string }).fetchedAt.slice(0, 10)}`;
    }
    if (rows.length > 0) await ctx.db.insert(agentSightings).values(rows).onConflictDoNothing();
    stats.signedAgents = rows.length;
  });

  await source("hfDaily", 15_000, async () => {
    const rows: Array<{ source: string; series: string; period: string; value: number; lo: null; hi: null }> = [];
    const probe = await fetchJson<{ num_rows_total?: number }>(`${AGENT_WATCH.hfDaily}&offset=0&length=1`);
    const total = probe.body?.num_rows_total;
    if (probe.status !== 200 || !Number.isSafeInteger(total) || total! < 0) throw new Error(`hfDaily ${probe.status}: invalid row count`);
    let offset = Math.max(0, total! - 2_500);
    for (let page = 0; page < 25 && offset < total!; page++) {
      if (timeLeft(ctx) < 15_000) { partial = true; break; }
      const { status, body } = await fetchJson<{ rows?: Array<{ row: { day: string; agent: string; pct_requests: number; pct_users: number } }> }>(
        `${AGENT_WATCH.hfDaily}&offset=${offset}&length=100`,
      );
      if (status !== 200 || !Array.isArray(body?.rows) || body.rows.length === 0) throw new Error(`hfDaily page ${status}: missing rows`);
      for (const item of body.rows) {
        const row = item?.row;
        if (!row || typeof row.day !== "string" || !row.day || typeof row.agent !== "string" || !row.agent || !Number.isFinite(row.pct_requests) || !Number.isFinite(row.pct_users) || row.pct_requests < 0 || row.pct_users < 0) throw new Error("hfDaily invalid observation");
        rows.push({ source: "hf-agent-usage", series: `${row.agent}:requests`, period: row.day, value: row.pct_requests, lo: null, hi: null });
        rows.push({ source: "hf-agent-usage", series: `${row.agent}:users`, period: row.day, value: row.pct_users, lo: null, hi: null });
      }
      offset += body.rows.length;
    }
    if (offset < total!) partial = true;
    // Validate the fetched window before replacing any previously stored observations.
    for (let i = 0; i < rows.length; i += 200) {
      await ctx.db.insert(externalSeries).values(rows.slice(i, i + 200)).onConflictDoUpdate({
        target: [externalSeries.source, externalSeries.series, externalSeries.period],
        set: { value: sql`excluded.value`, fetchedAt: new Date() },
      });
    }
    stats.hfRows = rows.length;
    stats.hfTotal = total;
    stats.hfLatest = rows.map((r) => r.period).sort().at(-1) ?? null;
  });

  await source("hfModels", 10_000, async () => {
    const { status, body } = await fetchJson<Array<{ createdAt?: string }>>(AGENT_WATCH.hfModels);
    if (status !== 200 || !Array.isArray(body) || body.length < 2) throw new Error(`hfModels ${status}: insufficient observations`);
    const times = body.map((m) => new Date(m?.createdAt ?? "").getTime());
    const spanMs = Math.max(...times) - Math.min(...times);
    if (times.some((time) => !Number.isFinite(time) || time <= 0) || spanMs <= 0) throw new Error("hfModels invalid creation interval");
    const perHour = Math.round((times.length / spanMs) * 3_600_000);
    const period = new Date().toISOString().slice(0, 13);
    await ctx.db.insert(externalSeries).values({ source: "hf-hub", series: "new-models-per-hour", period, value: perHour, lo: null, hi: null }).onConflictDoUpdate({
      target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value` },
    });
    stats.hfNewModelsPerHour = perHour;
  });
  stats.failed = [...new Set(failed)];
  return { stats, partial, outcome: failed.length ? "failed" : partial ? "partial" : "success" };
};
