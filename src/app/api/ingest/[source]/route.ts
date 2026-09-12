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
import { blueskyJob, mastodonJob } from "@/lib/ingest/social";
import { retentionJob } from "@/lib/ingest/retention";
import { ghArchiveJob } from "@/lib/ingest/gharchive";
import { robotsCensusJob } from "@/lib/ingest/robots-census";
import { packagesJob } from "@/lib/ingest/packages";
import { aiRobotsHistoryJob } from "@/lib/ingest/ai-robots-history";
import { baselineJob } from "@/lib/ingest/baseline";
import { wikipediaJob } from "@/lib/ingest/wikipedia";
import { PayloadTooLarge, readPayload, reportsOutcome } from "@/lib/ingest/request";

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
  bluesky: blueskyJob,
  mastodon: mastodonJob,
  github: githubJob,
  packages: packagesJob,
  baseline: baselineJob,
  retention: retentionJob,
  // Historical worker-payload endpoints. They are not scheduled by this repository or included in `all`.
  gharchive: ghArchiveJob,
  "robots-census": robotsCensusJob,
  "ai-robots-history": aiRobotsHistoryJob,
};

/** `all` runs cheap sources first and the rate-limited GitHub job last. */
const ALL_ORDER = ["ipranges", "wikipedia", "wikimedia", "moltbook", "osm", "mcp", "botcommits", "agentwatch", "radar", "bluesky", "mastodon", "packages", "baseline", "github", "watched", "github-signatures", "retention"];

const STATUS_SOURCES = new Set(["gharchive", "robots-census"]);
const BODY_SOURCES = new Set(["gharchive", "robots-census", "ai-robots-history"]);

async function handle(req: Request, source: string): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });
  if (source !== "all" && !JOBS[source]) return NextResponse.json({ ok: false, reason: "unknown-source" }, { status: 404 });

  const started = Date.now();
  const deadline = started + (maxDuration - 15) * 1000;
  let payload: string | undefined;
  if (req.method === "POST") {
    try { payload = await readPayload(req); }
    catch (err) {
      return NextResponse.json({ ok: false, reason: err instanceof PayloadTooLarge ? "payload-too-large" : "invalid-body" }, { status: err instanceof PayloadTooLarge ? 413 : 400 });
    }
    if (BODY_SOURCES.has(source) && !payload) return NextResponse.json({ ok: false, reason: "body-required" }, { status: 400 });
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
      if (remaining < 20_000) {
        for (const skipped of ALL_ORDER.slice(i)) reports.push({ source: skipped, ok: false, outcome: "partial", ms: 0, stats: { notRun: "deadline" }, partial: true });
        break;
      }
      const jobsLeft = ALL_ORDER.length - i;
      const slice = Math.max(20_000, Math.min(remaining, (remaining / jobsLeft) * 1.8));
      reports.push(await runJob(name, JOBS[name], { db, deadline: Date.now() + slice, payload, query }));
    }
  } else {
    reports.push(await runJob(source, JOBS[source], ctx, { record: !(req.method === "GET" && STATUS_SOURCES.has(source)) }));
  }

  const outcome = reportsOutcome(reports);
  return NextResponse.json({ ok: outcome === "success", outcome, ms: Date.now() - started, reports }, {
    status: outcome === "failed" ? 500 : 200,
    headers: { "cache-control": "no-store" },
  });
}

type Params = { params: Promise<{ source: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, (await params).source);
}

export async function POST(req: Request, { params }: Params) {
  return handle(req, (await params).source);
}
