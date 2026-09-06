export const dynamic = "force-dynamic";

/** Honeypot. The proxy already recorded the visit; this just answers with a plain 404. */
export function GET() {
  const html = `<!doctype html><meta charset="utf-8"><title>Not found</title><p>There is nothing here. This path is disallowed in robots.txt; the visit has been recorded.</p>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" },
  });
}

export const HEAD = GET;
