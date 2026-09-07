// GH Archive census worker.
//
// Streams hourly files from data.gharchive.org (every public GitHub event), counts
// pull requests opened by coding agents (bot account, branch prefix, text signature),
// commits whose messages name an AI tool, and the totals they are a share of. Results
// are posted to the site's /api/ingest/gharchive endpoint, one row per hour, so the
// site can aggregate them by day. The files are 70-150 MB each, far beyond a serverless
// function, which is why this runs in GitHub Actions.
//
//   node --experimental-strip-types scripts/gharchive.mjs --auto            # newest unprocessed hours
//   node --experimental-strip-types scripts/gharchive.mjs --from 2025-01-01-0 --to 2025-01-02-23
//   ... --shard 3/8   process every 8th missing hour, offset 3 (backfill matrix)
//   ... --dry         print instead of posting
//
// Env: SITE_URL, CRON_SECRET. Node 22.18+ or 24 (type stripping) is required because
// the agent list and signature rules are imported from the site's TypeScript sources.
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { GITHUB_AGENTS } from "../src/lib/github/agents.ts";
import { findSignatures, namedTool } from "../src/lib/github/signatures.ts";

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(a.slice(2), next);
    i++;
  } else args.set(a.slice(2), "true");
}

const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const DRY = args.has("dry");
const MAX_MINUTES = Number(args.get("max-minutes") ?? 330);
const BATCH = Number(args.get("batch") ?? 6);
if (!Number.isInteger(BATCH) || BATCH < 1 || BATCH > 24) throw new Error("--batch must be between 1 and 24");
const started = Date.now();

const BOT_IDS = new Map(GITHUB_AGENTS.filter((a) => a.id).map((a) => [a.id, a.key]));
const BRANCH_PREFIXES = GITHUB_AGENTS.filter((a) => a.tier === "branch-prefix").map((a) => ({ key: a.key, prefix: a.query.replace("head:", "") }));
const SIG_PRECHECK = /co-authored-by|generated (?:with|by|using)|made (?:with|by|using)|(?:implemented|written|built|developed|authored|created|drafted) (?:with|by|using)|aider:/i;

/** "2025-01-15-7" → { hour: "2025-01-15T07", file: "2025-01-15-7" } */
function normalizeHour(h) {
  const m = /^(\d{4}-\d{2}-\d{2})[-T](\d{1,2})$/.exec(h.trim());
  if (!m) throw new Error(`bad hour ${h}`);
  const hour = `${m[1]}T${m[2].padStart(2, "0")}`;
  const date = new Date(`${hour}:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 13) !== hour) throw new Error(`bad hour ${h}`);
  return { hour, file: `${m[1]}-${Number(m[2])}` };
}
function hourToDate(hour) {
  return new Date(`${hour}:00:00Z`);
}
function dateToHour(d) {
  return d.toISOString().slice(0, 13);
}
function* hoursBetween(from, to) {
  for (let t = hourToDate(from).getTime(); t <= hourToDate(to).getTime(); t += 3_600_000) yield dateToHour(new Date(t));
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

async function processHour(hour) {
  const { file } = normalizeHour(hour);
  const url = `https://data.gharchive.org/${file}.json.gz`;
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { "user-agent": "gcdTracker-gharchive/0.4 (+https://github.com/eshin087/gcdtracker-site)" } });
  if (res.status === 404) return null; // not published yet
  if (!res.ok) throw new Error(`${url} → ${res.status}`);

  // GitHub slimmed the public event payloads during 2025: PushEvents lost their commit
  // lists and PullRequestEvents lost body and author. The *_with_* counters say which
  // measures an hour can support, so the site can end a series instead of showing zero.
  const totals = { events: 0, prs_opened: 0, prs_merged: 0, pushes: 0, pushes_with_commits: 0, commits: 0, prs_with_body: 0 };
  const agentPrs = new Map(); // agent key → opened
  const agentMerged = new Map();
  const prSignatures = new Map(); // tool → PRs whose body names it (not already attributed)
  const commitSignatures = new Map(); // tool → commits whose message names it

  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length < 20) continue;
    totals.events++;
    if (line.includes('"type":"PushEvent"')) {
      totals.pushes++;
      const m = /"distinct_size":(\d+)/.exec(line);
      if (m) totals.commits += Number(m[1]);
      if (!line.includes('"commits":[')) continue;
      totals.pushes_with_commits++;
      if (!SIG_PRECHECK.test(line)) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      for (const c of ev.payload?.commits ?? []) {
        const hits = findSignatures(c.message);
        if (hits.length === 0) continue;
        bump(commitSignatures, namedTool(hits[0].excerpt));
      }
      continue;
    }
    if (!line.includes('"type":"PullRequestEvent"')) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const pr = ev.payload?.pull_request;
    const action = ev.payload?.action;
    if (!pr) continue;
    // Opened events are raised by the author, so actor.id stands in when the payload has no user.
    const agent = BOT_IDS.get(pr.user?.id) ?? (action === "opened" ? BOT_IDS.get(ev.actor?.id) : undefined) ?? BRANCH_PREFIXES.find((b) => typeof pr.head?.ref === "string" && pr.head.ref.startsWith(b.prefix))?.key ?? null;
    if (action === "opened") {
      totals.prs_opened++;
      if (typeof pr.body === "string") totals.prs_with_body++;
      if (agent) bump(agentPrs, agent);
      else if (pr.body && SIG_PRECHECK.test(pr.body)) {
        const hits = findSignatures(pr.body);
        if (hits.length > 0) bump(prSignatures, namedTool(hits[0].excerpt));
      }
    } else if (action === "merged" || (action === "closed" && pr.merged)) {
      // The actor of a merge is the merger, so only author and branch evidence count here.
      totals.prs_merged++;
      const author = BOT_IDS.get(pr.user?.id) ?? BRANCH_PREFIXES.find((b) => typeof pr.head?.ref === "string" && pr.head.ref.startsWith(b.prefix))?.key ?? null;
      if (author) bump(agentMerged, author);
    }
  }

  const rows = [];
  for (const [k, v] of Object.entries(totals)) rows.push({ kind: "total", key: k, value: v });
  for (const [k, v] of agentPrs) rows.push({ kind: "agent-prs", key: k, value: v });
  for (const [k, v] of agentMerged) rows.push({ kind: "agent-merged", key: k, value: v });
  for (const [k, v] of prSignatures) rows.push({ kind: "pr-signature", key: k, value: v });
  for (const [k, v] of commitSignatures) rows.push({ kind: "commit-signature", key: k, value: v });
  return { hour: normalizeHour(hour).hour, rows };
}

async function site(path, init = {}) {
  const res = await fetch(`${SITE_URL}${path}`, {
    signal: AbortSignal.timeout(240_000),
    ...init,
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json", "user-agent": "gcdTracker-gharchive/0.4", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function post(batch) {
  if (batch.length === 0) return;
  if (DRY) {
    for (const h of batch) console.log(JSON.stringify(h));
    return;
  }
  const out = await site("/api/ingest/gharchive", { method: "POST", body: JSON.stringify({ ingestVersion: 2, hours: batch }) });
  const r = out.reports?.[0];
  console.log(`posted ${batch[0].hour}..${batch[batch.length - 1].hour}: ${r?.ok ? "ok" : `FAILED ${r?.error}`} ${JSON.stringify(r?.stats ?? {})}`);
  if (!r?.ok) throw new Error("ingest rejected the batch");
}

/** Hours the site has not stored yet, within [from, to]. */
async function missingHours(from, to) {
  if (DRY) return [...hoursBetween(from, to)];
  const out = await site(`/api/ingest/gharchive?from=${from}&to=${to}`);
  const report = out.reports?.[0];
  if (report?.outcome !== "success" || !Array.isArray(report.stats?.missing)) throw new Error("invalid missing-hour status");
  return report.stats.missing;
}

async function main() {
  if (!DRY && (!SITE_URL || !SECRET)) throw new Error("SITE_URL and CRON_SECRET are required (or pass --dry)");
  let hours;
  if (args.has("auto")) {
    // GH Archive publishes with roughly a two-hour lag; look back a week for gaps.
    const to = dateToHour(new Date(Date.now() - 3 * 3_600_000));
    const from = dateToHour(new Date(Date.now() - 7 * 86_400_000));
    hours = await missingHours(from, to);
  } else {
    const from = normalizeHour(args.get("from")).hour;
    const to = normalizeHour(args.get("to") ?? args.get("from")).hour;
    hours = args.has("all") ? [...hoursBetween(from, to)] : await missingHours(from, to);
  }
  if (args.has("shard")) {
    const [i, n] = args.get("shard").split("/").map(Number);
    hours = hours.filter((_, idx) => idx % n === i);
  }
  hours.sort();
  console.log(`${hours.length} hours to process`);

  let batch = [];
  let done = 0;
  for (const hour of hours) {
    if (Date.now() - started > MAX_MINUTES * 60_000) {
      console.log(`time budget reached after ${done} hours; the next run continues`);
      break;
    }
    const t0 = Date.now();
    const result = await processHour(hour);
    if (!result) {
      console.log(`${hour}: not published yet`);
      continue;
    }
    const tot = Object.fromEntries(result.rows.filter((r) => r.kind === "total").map((r) => [r.key, r.value]));
    const agents = result.rows.filter((r) => r.kind === "agent-prs").reduce((s, r) => s + r.value, 0);
    console.log(`${hour}: ${tot.events} events, ${tot.prs_opened} PRs opened, ${agents} by agents, ${tot.commits} commits · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    batch.push(result);
    done++;
    if (batch.length >= BATCH) {
      await post(batch);
      batch = [];
    }
  }
  await post(batch);
  console.log(`finished ${done} hours in ${((Date.now() - started) / 60_000).toFixed(1)} min`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
