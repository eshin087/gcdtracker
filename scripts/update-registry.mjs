// Refreshes data/signature-registry.json (Cloudflare's public registry of agents that
// sign requests with Web Bot Auth). The host blocks cloud providers and Node's fetch
// client, so this uses curl from a workstation: `node scripts/update-registry.mjs`, then commit.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const SOURCE = "https://assets.radar.cloudflare.com/bots/signature-agent-registry.txt";

const text = execFileSync(
  "curl",
  ["-sS", "--fail", "--max-time", "30", "-A", "gcdTracker/0.3 (+https://github.com/eshin087/gcdtracker-site) bot", "-H", "Accept: text/plain, */*", SOURCE],
  { encoding: "utf8" },
);
const urls = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.startsWith("http"));
if (urls.length === 0) throw new Error("registry came back empty");
const out = {
  fetchedAt: new Date().toISOString(),
  source: SOURCE,
  note: "Public registry of agents that sign requests with Web Bot Auth. The host blocks cloud fetchers, so this copy is refreshed by hand with scripts/update-registry.mjs.",
  urls,
};
await writeFile(new URL("../data/signature-registry.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${urls.length} signed-agent directories`);
