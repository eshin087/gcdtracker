import { SITE } from "@/lib/site";
import { trapPath } from "@/lib/trap";

export const dynamic = "force-static";

export function GET() {
  const body = [
    "# gcdTracker — tracking autonomous AI agents on the public internet",
    "# Everything is allowed except the paths below. Visiting them tells us who ignores this file.",
    "User-agent: *",
    "Allow: /",
    "Disallow: /trap/",
    "Disallow: /private/",
    `Disallow: ${trapPath("robots")}/`,
    "Disallow: /api/ingest/",
    "",
    `Sitemap: ${SITE.url}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
