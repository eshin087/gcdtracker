// robots.txt census worker.
//
// Common Crawl fetches robots.txt for every host it visits and publishes them as
// ~100,000 small WARC files per crawl (data.commoncrawl.org, no key). This samples a
// fixed number of those files spread across each crawl, parses every robots.txt, and
// counts how many sites name or fully block each AI crawler token. Results go to the
// site's /api/ingest/robots-census endpoint; one census per crawl, back to 2023.
//
//   node --experimental-strip-types scripts/robots-census.mjs            # crawls not yet stored
//   ... --crawl CC-MAIN-2025-30   one specific crawl
//   ... --files 40                files sampled per crawl (default 100, ≈ 50k sites)
//   ... --dry                     print instead of posting
//
// Env: SITE_URL, CRON_SECRET.
import { gunzipSync } from "node:zlib";
import { ROBOTS_TOKENS } from "../src/lib/robots/tokens.ts";

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
const FILES = Number(args.get("files") ?? 100);
const SINCE = args.get("since") ?? "2023-01-01";
const MAX_CRAWLS = Number(args.get("max-crawls") ?? 40);
const UA = "gcdTracker-robots-census/0.4 (+https://github.com/eshin087/gcdtracker-site)";
const CC = "https://data.commoncrawl.org/";

const TOKENS_LC = new Map(ROBOTS_TOKENS.map((t) => [t.toLowerCase(), t]));

async function fetchRetry(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.ok) return res;
    if (res.status === 404) return null;
    await new Promise((r) => setTimeout(r, 2_000 * (i + 1)));
  }
  throw new Error(`${url}: gave up`);
}

/**
 * robots.txt group semantics: consecutive User-agent lines open a group; the rules that
 * follow belong to every agent in it. A group with `Disallow: /` (and no Allow) is a
 * full block for its agents.
 */
export function parseRobots(text) {
  const mentioned = new Set();
  const blocked = new Set();
  let agents = [];
  let inRules = false;
  let disallowAll = false;
  let allowSomething = false;
  const flush = () => {
    if (agents.length === 0) return;
    for (const a of agents) {
      mentioned.add(a);
      if (disallowAll && !allowSomething) blocked.add(a);
    }
    agents = [];
    inRules = false;
    disallowAll = false;
    allowSomething = false;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    if (field === "user-agent") {
      if (inRules) flush();
      const token = TOKENS_LC.get(value.toLowerCase().split(/[\s/]/)[0]);
      if (token) agents.push(token);
      else agents.push(null); // unknown agent still owns the group
      continue;
    }
    if (field === "disallow" || field === "allow") {
      inRules = true;
      if (field === "disallow" && value === "/") disallowAll = true;
      if (field === "allow" && value && value !== "") allowSomething = true;
      continue;
    }
    if (field === "sitemap") continue;
    inRules = true;
  }
  flush();
  mentioned.delete(null);
  blocked.delete(null);
  return { mentioned, blocked };
}

/** Yield { url, status, body } for each response record in a robots.txt WARC file. */
function* warcRecords(buf) {
  const text = buf.toString("latin1");
  let pos = 0;
  while (true) {
    const start = text.indexOf("WARC/1.", pos);
    if (start === -1) return;
    const headEnd = text.indexOf("\r\n\r\n", start);
    if (headEnd === -1) return;
    const head = text.slice(start, headEnd);
    const len = Number(/Content-Length:\s*(\d+)/i.exec(head)?.[1] ?? 0);
    const type = /WARC-Type:\s*(\S+)/i.exec(head)?.[1];
    const uri = /WARC-Target-URI:\s*(\S+)/i.exec(head)?.[1];
    const bodyStart = headEnd + 4;
    const body = text.slice(bodyStart, bodyStart + len);
    pos = bodyStart + len;
    if (type !== "response" || !uri) continue;
    const status = Number(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(body)?.[1] ?? 0);
    const sep = body.indexOf("\r\n\r\n");
    yield { url: uri, status, body: sep === -1 ? "" : body.slice(sep + 4) };
  }
}

async function censusCrawl(crawl) {
  const listRes = await fetchRetry(`${CC}crawl-data/${crawl.id}/robotstxt.paths.gz`);
  if (!listRes) return null;
  const paths = gunzipSync(Buffer.from(await listRes.arrayBuffer())).toString("utf8").split("\n").filter(Boolean);
  const step = Math.max(1, Math.floor(paths.length / FILES));
  const chosen = paths.filter((_, i) => i % step === 0).slice(0, FILES);
  const counts = Object.fromEntries(ROBOTS_TOKENS.map((t) => [t, { mentioned: 0, blocked: 0 }]));
  const hosts = new Set();
  let files = 0;
  for (const p of chosen) {
    const res = await fetchRetry(`${CC}${p}`);
    if (!res) continue;
    let buf;
    try {
      buf = gunzipSync(Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      console.warn(`  skip ${p}: ${err.message}`);
      continue;
    }
    files++;
    for (const rec of warcRecords(buf)) {
      if (rec.status !== 200) continue;
      let host;
      try {
        host = new URL(rec.url).host.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (hosts.has(host)) continue;
      hosts.add(host);
      const { mentioned, blocked } = parseRobots(rec.body.slice(0, 200_000));
      for (const t of mentioned) counts[t].mentioned++;
      for (const t of blocked) counts[t].blocked++;
    }
    process.stdout.write(`\r  ${crawl.id}: ${files}/${chosen.length} files, ${hosts.size} sites`);
  }
  process.stdout.write("\n");
  return { id: crawl.id, date: crawl.from.slice(0, 10), files, sites: hosts.size, tokens: counts };
}

async function site(path, init = {}) {
  const res = await fetch(`${SITE_URL}${path}`, { ...init, headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json", "user-agent": UA } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  if (!DRY && (!SITE_URL || !SECRET)) throw new Error("SITE_URL and CRON_SECRET are required (or pass --dry)");
  const all = await (await fetchRetry("https://index.commoncrawl.org/collinfo.json")).json();
  let crawls = all.filter((c) => c.from && c.from.slice(0, 10) >= SINCE).sort((a, b) => a.from.localeCompare(b.from));
  if (args.has("crawl")) crawls = crawls.filter((c) => c.id === args.get("crawl"));
  else if (!DRY) {
    const status = await site("/api/ingest/robots-census");
    const done = new Set(status.reports?.[0]?.stats?.done ?? []);
    crawls = crawls.filter((c) => !done.has(c.from.slice(0, 10)));
  }
  crawls = crawls.slice(-MAX_CRAWLS);
  console.log(`${crawls.length} crawl(s) to census: ${crawls.map((c) => c.id).join(", ") || "none"}`);
  for (const crawl of crawls) {
    const record = await censusCrawl(crawl);
    if (!record) {
      console.log(`  ${crawl.id}: no robots.txt listing`);
      continue;
    }
    const gpt = record.tokens.GPTBot;
    console.log(`  ${record.id} (${record.date}): ${record.sites} sites · GPTBot blocked by ${((100 * gpt.blocked) / record.sites).toFixed(2)}%`);
    if (DRY) console.log(JSON.stringify(record));
    else {
      const out = await site("/api/ingest/robots-census", { method: "POST", body: JSON.stringify({ crawls: [record] }) });
      const r = out.reports?.[0];
      console.log(`  posted: ${r?.ok ? "ok" : `FAILED ${r?.error}`}`);
      if (!r?.ok) process.exit(1);
    }
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
