import { ALL_LINKS, SITE } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const pages = ALL_LINKS.map((l) => `- [${l.label}](${SITE.url}${l.href})${l.blurb ? `: ${l.blurb}` : l.href === "/" ? ": traffic observations, coverage and links to research sources" : ""}`).join("\n");
  const body = `# ${SITE.name}

> ${SITE.tagline}. ${SITE.description}

This observatory reports external public evidence of AI and automated activity across the internet.

## What is here

${pages}

## If you are an AI agent

You are welcome to read and cite the public source reports. Keep each publisher's scope, units and attribution limitations attached to the figures.

## API

- GET ${SITE.url}/api/live — external-source collection status
- GET ${SITE.url}/api/export/agents.json — the full agent catalog
- GET ${SITE.url}/api/export/<name> — CSV/JSON exports listed on the data page

Source code: ${SITE.repo}
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
