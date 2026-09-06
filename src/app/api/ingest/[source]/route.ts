import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorized } from "@/lib/ingest/auth";
import { type Job, type RunReport, runJob } from "@/lib/ingest/common";
import { githubJob } from "@/lib/ingest/github";
import { ipRangesJob } from "@/lib/ingest/ipranges";
import { moltbookJob } from "@/lib/ingest/moltbook";
import { observatoryJob } from "@/lib/ingest/observatory";
import { retentionJob } from "@/lib/ingest/retention";
import { wikipediaJob } from "@/lib/ingest/wikipedia";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

const JOBS: Record<string, Job> = {
  ipranges: ipRangesJob,
  wikipedia: wikipediaJob,
  moltbook: moltbookJob,
  observatory: observatoryJob,
  github: githubJob,
  retention: retentionJob,
};

/** `all` runs cheap sources first and the rate-limited GitHub job last. */
const ALL_ORDER = ["ipranges", "wikipedia", "moltbook", "observatory", "github", "retention"];

async function handle(req: Request, source: string): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (!db) return NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });
  if (source !== "all" && !JOBS[source]) return NextResponse.json({ ok: false, reason: "unknown-source" }, { status: 404 });

  const started = Date.now();
  const deadline = started + (maxDuration - 15) * 1000;
  const ctx = { db, deadline };
  const reports: RunReport[] = [];

  if (source === "all") {
    for (const name of ALL_ORDER) {
      if (Date.now() > deadline - 20_000) break;
      reports.push(await runJob(name, JOBS[name], ctx));
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
