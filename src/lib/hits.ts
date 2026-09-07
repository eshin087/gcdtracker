import { sql } from "drizzle-orm";
import { findAgent } from "@/lib/agents/catalog";
import { classify, type Classification, type HeaderGetter } from "@/lib/agents/classify";
import { isAiCategory } from "@/lib/agents/types";
import { verifyIp } from "@/lib/agents/verify";
import { db } from "@/lib/db";
import { trafficDaily, visits } from "@/lib/db/schema";
import { dayOf, truncate } from "@/lib/format";
import { clientIp, ipHash, ipPrefix } from "@/lib/ip";
import { isTrapPath, TRAP_PREFIX } from "@/lib/trap";

export interface Hit {
  ts: Date;
  day: string;
  path: string;
  method: string;
  ua: string;
  classification: Classification;
  /** never stored; used only for verification */
  ip: string | null;
  ipPrefix: string | null;
  ipHash: string | null;
  country: string | null;
  referer: string | null;
  isTrap: boolean;
  trapToken: string | null;
  isRobots: boolean;
  isLlms: boolean;
}

export interface HitInput {
  method: string;
  pathname: string;
  search?: string;
  headers: HeaderGetter;
  now?: Date;
}

const ASSET_RE = /\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|otf|json|xml|webmanifest)$/i;

function refererHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? truncate(u.host.toLowerCase(), 256) : null;
  } catch {
    return null;
  }
}

/**
 * Pure function: decide whether a request is worth counting and describe it.
 * Returns null for asset requests, client-side navigations and prefetches.
 */
export function buildHit(input: HitInput): Hit | null {
  const { pathname } = input;
  const h = input.headers;
  const method = input.method.toUpperCase();

  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/") || pathname === "/favicon.ico") return null;
  const isRobots = pathname === "/robots.txt";
  const isLlms = pathname === "/llms.txt";
  const isSitemap = pathname === "/sitemap.xml";
  if (ASSET_RE.test(pathname) && !isSitemap) return null;
  if (method !== "GET" && method !== "HEAD" && method !== "POST") return null;

  // Client-side navigations and prefetches are not visits.
  if (input.search?.includes("_rsc=")) return null;
  if (h("next-router-prefetch") || h("rsc")) return null;
  if (h("purpose") === "prefetch" || h("sec-purpose")?.includes("prefetch")) return null;
  const dest = h("sec-fetch-dest");
  if (dest && dest !== "document") return null;

  const ua = truncate((h("user-agent") ?? "").trim(), 512) ?? "";
  const classification = classify(ua, h);
  if (method === "HEAD" && classification.category === "human") return null;

  const now = input.now ?? new Date();
  const ip = clientIp(h);
  const isTrap = isTrapPath(pathname);
  let trapToken: string | null = null;
  if (isTrap) {
    trapToken = pathname.startsWith(TRAP_PREFIX)
      ? pathname.slice(TRAP_PREFIX.length).split("/")[0] || "unknown"
      : "private";
  }

  return {
    ts: now,
    day: dayOf(now),
    path: truncate(pathname, 256) ?? pathname,
    method,
    ua,
    classification,
    ip,
    ipPrefix: ipPrefix(ip),
    ipHash: ipHash(ip),
    country: h("x-vercel-ip-country")?.slice(0, 2).toUpperCase() ?? null,
    referer: refererHost(h("referer")),
    isTrap,
    trapToken,
    isRobots,
    isLlms,
  };
}

/** Raw rows only for AI agents, signed requests, honeypot hits and robots/llms.txt readers. */
export function shouldStoreRaw(hit: Hit): boolean {
  const c = hit.classification;
  return isAiCategory(c.category) || c.signed || hit.isTrap || hit.isRobots || hit.isLlms;
}

/** One HTTP round trip to Neon: optional raw row + the per-day counter upsert. */
export async function recordHit(hit: Hit): Promise<void> {
  if (!db) return;
  const category = hit.classification.category;
  const counter = db
    .insert(trafficDaily)
    .values({ day: hit.day, category, count: 1 })
    .onConflictDoUpdate({
      target: [trafficDaily.day, trafficDaily.category],
      set: { count: sql`${trafficDaily.count} + 1` },
    });

  if (!shouldStoreRaw(hit)) {
    await counter;
    return;
  }

  const c = hit.classification;
  const def = c.slug ? findAgent(c.slug) : undefined;
  const v = await verifyIp(hit.ip, def?.ipSource);
  const insert = db.insert(visits).values({
    ts: hit.ts,
    day: hit.day,
    path: hit.path,
    method: hit.method,
    ua: hit.ua,
    agentSlug: c.slug,
    agentName: c.name,
    operator: c.operator,
    category,
    verified: v.verified,
    verifiedBy: v.by,
    signed: c.signed,
    signatureAgent: c.signatureAgent,
    ipPrefix: hit.ipPrefix,
    ipHash: hit.ipHash,
    country: hit.country,
    referer: hit.referer,
    robotsViolation: hit.isTrap,
    trapToken: hit.trapToken,
  });
  await db.batch([insert, counter]);
}
