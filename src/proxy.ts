import { after, NextResponse, type NextRequest } from "next/server";
import { buildHit, recordHit } from "@/lib/hits";

const LOG_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

/**
 * Runs before every page request (Node runtime, before the cache on Vercel).
 * Classifies the visitor and records the hit after the response is sent, so
 * pages are never slowed down by the sensor.
 */
export default function proxy(request: NextRequest) {
  const hit = buildHit({
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    headers: (name) => request.headers.get(name),
  });

  if (hit) {
    after(async () => {
      try {
        await withTimeout(recordHit(hit), LOG_TIMEOUT_MS);
      } catch (err) {
        console.error("hit-log failed", err);
      }
    });
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals, the API and static assets.
  // robots.txt, llms.txt, sitemap.xml and /trap/* are deliberately included: those fetches are the signal.
  matcher: ["/((?!_next/|api/|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|otf)$).*)"],
};
