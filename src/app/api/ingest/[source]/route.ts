import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized } from "@/lib/ingest/auth";
import { type Job, type RunReport, runJob } from "@/lib/ingest/common";
import { githubJob } from "@/lib/ingest/github";
import { ipRangesJob } from "@/lib/ingest/ipranges";
import { moltbookJob } from "@/lib/ingest/moltbook";
import { watchedJob } from "@/lib/ingest/watched";
import { wikimediaJob } from "@/lib/ingest/wikimedia";
import { osmJob } from "@/lib/ingest/osm";
import { mcpJob } from "@/lib/ingest/mcp";
import { botcommitsJob } from "@/lib/ingest/botcommits";
import { agentWatchJob } from "@/lib/ingest/agentwatch";
import { githubSignaturesJob } from "@/lib/ingest/github-signatures";
import { radarJob } from "@/lib/ingest/radar";
import { retentionJob } from "@/lib/ingest/retention";
import { ghArchiveJob } from "@/lib/ingest/gharchive";
import { robotsCensusJob } from "@/lib/ingest/robots-census";
import { packagesJob } from "@/lib/ingest/packages";
import { aiRobotsHistoryJob } from "@/lib/ingest/ai-robots-history";
import { baselineJob } from "@/lib/ingest/baseline";
import { wikipediaJob } from "@/lib/ingest/wikipedia";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

const JOBS: Record<string, Job> = {
  ipranges: ipRangesJob,
  wikipedia: wikipediaJob,
  moltbook: moltbookJob,
  watched: watchedJob,
  wikimedia: wikimediaJob,
  osm: osmJob,
  mcp: mcpJob,
  botcommits: botcommitsJob,
  agentwatch: agentWatchJob,
  "github-signatures": githubSignaturesJob,
  radar: radarJob,
  github: githubJob,
  packages: packagesJob,
  baseline: baselineJob,
  retention: retentionJob,
  // Fed by GitHub Actions workers that post pre-aggregated results (never part of `all`).
  gharchive: ghArchiveJob,
  "robots-census": robotsCensusJob,
  "ai-robots-history": aiRobotsHistoryJob,
};

/** `all` runs cheap sources first and the rate-limited GitHub job last. */
const ALL_ORDER = ["ipranges", "wikipedia", "wikimedia", "moltbook", "osm", "mcp", "botcommits", "agentwatch", "radar", "packages", "baseline", "github", "watched", "github-signatures", "retention"];

async function handle(req: Request, source: string): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });
  if (source !== "all" && !JOBS[source]) return NextResponse.json({ ok: false, reason: "unknown-source" }, { status: 404 });

  const started = Date.now();
  const deadline = started + (maxDuration - 15) * 1000;
  let payload: string | undefined;
  if (req.method === "POST") {
    try {
      const text = await req.text();
      if (text && text.length < 2_000_000) payload = text;
    } catch {
      payload = undefined;
    }
  }
  const query = new URL(req.url).searchParams;
  const ctx = { db, deadline, payload, query };
  const reports: RunReport[] = [];

  if (source === "all") {
    // Each job gets a fair slice of the remaining time so the paced GitHub jobs
    // cannot starve the ones after them; cheap jobs return early and hand time on.
    for (let i = 0; i < ALL_ORDER.length; i++) {
      const name = ALL_ORDER[i];
      const remaining = deadline - Date.now();
      if (remaining < 20_000) break;
      const jobsLeft = ALL_ORDER.length - i;
      const slice = Math.max(20_000, Math.min(remaining, (remaining / jobsLeft) * 1.8));
      reports.push(await runJob(name, JOBS[name], { db, deadline: Date.now() + slice, payload }));
    }
  } else {
    reports.push(await runJob(source, JOBS[source], ctx));
  }

  const ok = reports.some((r) => r.ok);
  return NextResponse.json({ ok, ms: Date.now() - started, reports }, { status: ok ? 200 : 500 });
}

type Params = { params: Promise<{ source: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, (await params).source);
}

export async function POST(req: Request, { params }: Params) {
  return handle(req, (await params).source);
}
