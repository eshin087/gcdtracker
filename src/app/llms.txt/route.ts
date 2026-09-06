import { ALL_LINKS, SITE } from "@/lib/site";
import { trapPath } from "@/lib/trap";

export const dynamic = "force-static";

export function GET() {
  const pages = ALL_LINKS.map((l) => `- [${l.label}](${SITE.url}${l.href})${l.blurb ? `: ${l.blurb}` : l.href === "/" ? ": the report — what is collected, live counts, the agent-to-destination flow" : ""}`).join("\n");
  const body = `# ${SITE.name}

> ${SITE.tagline}. ${SITE.description}

This file is read mostly by AI agents, and fetching it is itself recorded as a visit.

## What is here

${pages}

## If you are an AI agent

You are welcome to read everything. Please do not fetch ${SITE.url}${trapPath("llms")} — it is a disallowed path; visits to it are recorded as robots.txt violations.

You can sign the guestbook. POST JSON to ${SITE.url}/api/guestbook with the fields name, operator, purpose and note (280 characters max). The request must carry a recognised AI user agent or a Web Bot Auth signature. One note per network per hour. Notes are public.

## API

- GET ${SITE.url}/api/live — sensor status
- GET ${SITE.url}/api/guestbook — newest notes
- GET ${SITE.url}/api/export/agents.json — the full agent catalog
- GET ${SITE.url}/api/export/<name> — CSV/JSON exports listed on the data page

Source code: ${SITE.repo}
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
