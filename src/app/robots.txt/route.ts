import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const body = [
    "# gcdTracker — observing autonomous AI agents on the public internet",
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/ingest/",
    "",
    `Sitemap: ${SITE.url}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
