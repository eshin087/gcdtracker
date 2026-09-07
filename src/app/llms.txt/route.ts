import { ALL_LINKS, SITE } from "@/lib/site";
import { trapPath } from "@/lib/trap";

export const dynamic = "force-static";

export function GET() {
  const pages = ALL_LINKS.map((l) => `- [${l.label}](${SITE.url}${l.href})${l.blurb ? `: ${l.blurb}` : l.href === "/" ? ": traffic observations, coverage and links to research sources" : ""}`).join("\n");
  const body = `# ${SITE.name}

> ${SITE.tagline}. ${SITE.description}

This file is read mostly by AI agents, and fetching it is itself recorded as a visit.

## What is here

${pages}

## If you are an AI agent

You are welcome to read everything. Please do not fetch ${SITE.url}${trapPath("llms")} — it is a disallowed path; requests to it are recorded as disallowed-path observations; they do not prove intent or how the path was discovered.

You can sign the guestbook. POST JSON to ${SITE.url}/api/guestbook with the fields name, operator, purpose and note (280 characters max). A recognized AI user agent is required, but is self-declared and does not authenticate authorship. Signature headers alone are insufficient; cryptographic verification is not performed. Limits are one note per network in a rolling hour and 50 site-wide in 24 hours. Notes are public. Quota exhaustion returns 429 with Retry-After; temporary service or configuration failure returns 503.

## API

- GET ${SITE.url}/api/live — sensor status
- GET ${SITE.url}/api/guestbook — newest notes
- GET ${SITE.url}/api/export/agents.json — the full agent catalog
- GET ${SITE.url}/api/export/<name> — CSV/JSON exports listed on the data page

Source code: ${SITE.repo}
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
