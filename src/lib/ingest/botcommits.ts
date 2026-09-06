import { sql } from "drizzle-orm";
import { externalSeries } from "@/lib/db/schema";
import { fetchJson, type Job } from "./common";

export const BOTCOMMITS = { site: "https://botcommits.dev", url: "https://botcommits.dev/data.json" } as const;

interface Data {
  updated?: string;
  labels?: string[];
  tools?: Record<string, Array<number | null>>;
  tool_labels?: Record<string, string>;
  claude_lo?: Array<number | null>;
  claude_hi?: Array<number | null>;
  total6?: Array<number | null>;
  partial?: boolean[];
  last_full_month?: string;
}

/** Curated monthly series of AI-attributed commits on GitHub, quoted from botcommits.dev. */
export const botcommitsJob: Job = async (ctx) => {
  const { status, body } = await fetchJson<Data>(BOTCOMMITS.url);
  if (status !== 200 || !body?.labels || !body.tools) throw new Error(`botcommits ${status}`);
  const rows: Array<{ source: string; series: string; period: string; value: number; lo: number | null; hi: number | null }> = [];
  const labels = body.labels;
  for (const [tool, values] of Object.entries(body.tools)) {
    values.forEach((v, i) => {
      if (v === null || v === undefined || !labels[i]) return;
      rows.push({
        source: "botcommits",
        series: tool,
        period: labels[i],
        value: v,
        lo: tool === "claude" ? (body.claude_lo?.[i] ?? null) : null,
        hi: tool === "claude" ? (body.claude_hi?.[i] ?? null) : null,
      });
    });
  }
  body.total6?.forEach((v, i) => {
    if (v !== null && v !== undefined && labels[i]) rows.push({ source: "botcommits", series: "total", period: labels[i], value: v, lo: null, hi: null });
  });
  for (let i = 0; i < rows.length; i += 200) {
    await ctx.db
      .insert(externalSeries)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({ target: [externalSeries.source, externalSeries.series, externalSeries.period], set: { value: sql`excluded.value`, lo: sql`excluded.lo`, hi: sql`excluded.hi`, fetchedAt: new Date() } });
  }
  return { stats: { rows: rows.length, updated: body.updated ?? null, lastFullMonth: body.last_full_month ?? null, toolLabels: body.tool_labels ?? {} } };
};
