// Refreshes data/ai-robots.json from the ai.robots.txt project.
// Run manually: `node scripts/update-ai-robots.mjs` (never at build time).
import { writeFile } from "node:fs/promises";

const SOURCE = "https://raw.githubusercontent.com/ai-robots-txt/ai.robots.txt/main/robots.json";

const res = await fetch(SOURCE, {
  headers: { "user-agent": "gcdTracker/0.1 (+https://github.com/eshin087/gcdtracker) bot" },
});
if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
const agents = await res.json();
const out = {
  fetchedAt: new Date().toISOString(),
  source: SOURCE,
  license: "https://github.com/ai-robots-txt/ai.robots.txt/blob/main/LICENSE",
  agents,
};
await writeFile(new URL("../data/ai-robots.json", import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${Object.keys(agents).length} agents`);
