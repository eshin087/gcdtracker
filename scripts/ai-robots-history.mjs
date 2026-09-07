// Crawler-identity history worker.
//
// The ai.robots.txt list (github.com/ai-robots-txt/ai.robots.txt) is the community
// catalogue of AI crawler user agents. Its git history says when each token was first
// listed, which dates the site's agent sightings properly (a first import would
// otherwise stamp every token with the same day) and gives a monthly series of new
// crawler identities back to 2023. Posts to /api/ingest/ai-robots-history.
//
//   node scripts/ai-robots-history.mjs            # clone, walk history, post
//   node scripts/ai-robots-history.mjs --dry      # print instead of posting
//
// Env: SITE_URL, CRON_SECRET. Needs git.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DRY = process.argv.includes("--dry");
const SITE_URL = (process.env.SITE_URL ?? "").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET ?? "";
const REPO = "https://github.com/ai-robots-txt/ai.robots.txt.git";

function git(dir, args) {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Tokens listed in one revision: robots.json keys, else User-agent lines of robots.txt. */
function tokensAt(dir, sha, file) {
  let text;
  try {
    text = git(dir, ["show", `${sha}:${file}`]);
  } catch {
    return null;
  }
  if (file === "robots.json") {
    try {
      return Object.keys(JSON.parse(text));
    } catch {
      return null;
    }
  }
  return text
    .split(/\r?\n/)
    .map((l) => /^\s*user-agent\s*:\s*(.+?)\s*$/i.exec(l)?.[1])
    .filter((t) => t && t !== "*");
}

export function firstSeenFromHistory(commits, tokensOf) {
  const first = new Map(); // lower-case token → { token, date, sha }
  for (const { sha, date } of commits) {
    const tokens = tokensOf(sha);
    if (!tokens) continue;
    for (const t of tokens) {
      const k = t.toLowerCase();
      if (!first.has(k)) first.set(k, { token: t, date, sha });
    }
  }
  return [...first.values()];
}

async function main() {
  if (!DRY && (!SITE_URL || !SECRET)) throw new Error("SITE_URL and CRON_SECRET are required (or pass --dry)");
  const dir = mkdtempSync(join(tmpdir(), "ai-robots-"));
  try {
    execFileSync("git", ["clone", "--quiet", "--filter=blob:none", REPO, dir], { stdio: "inherit" });
    // Oldest first, every commit that touched either list file.
    const log = git(dir, ["log", "--reverse", "--format=%H|%cI", "--", "robots.json", "robots.txt"]);
    const commits = log
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [sha, date] = l.split("|");
        return { sha, date: date.slice(0, 10) };
      });
    console.log(`${commits.length} commits touching the list`);
    const cache = new Map();
    const tokensOf = (sha) => {
      if (!cache.has(sha)) cache.set(sha, tokensAt(dir, sha, "robots.json") ?? tokensAt(dir, sha, "robots.txt"));
      return cache.get(sha);
    };
    const current = new Set((tokensOf(commits.at(-1).sha) ?? []).map((t) => t.toLowerCase()));
    const tokens = firstSeenFromHistory(commits, tokensOf).filter((t) => current.has(t.token.toLowerCase()));
    const byMonth = {};
    for (const t of tokens) byMonth[t.date.slice(0, 7)] = (byMonth[t.date.slice(0, 7)] ?? 0) + 1;
    console.log(`${tokens.length} tokens dated, ${commits[0]?.date} → ${commits.at(-1)?.date}`);
    const payload = { source: "ai-robots-txt", tokens: tokens.map(({ token, date }) => ({ token, firstSeen: date })), newPerMonth: byMonth };
    if (DRY) {
      console.log(JSON.stringify(byMonth, null, 1));
      console.log(tokens.slice(0, 5), tokens.slice(-5));
      return;
    }
    const res = await fetch(`${SITE_URL}/api/ingest/ai-robots-history`, {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json", "user-agent": "gcdTracker-ai-robots-history/0.4" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(res.status, text.slice(0, 400));
    if (!res.ok) process.exit(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
