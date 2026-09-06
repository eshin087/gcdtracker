import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CATALOG, IP_SOURCES } from "@/lib/agents/catalog";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { forumDaily, githubDaily, githubEvents, guestbookNotes, trafficDaily, visits, wikiEdits } from "@/lib/db/schema";

export const revalidate = 300;

const LIMIT = 50_000;
const CACHE = { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" };

function csv(name: string, body: string) {
  return new Response(body, { headers: { ...CACHE, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
}

const noDb = () => NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (name === "agents.json") {
    return NextResponse.json({ generatedAt: new Date().toISOString(), ipSources: IP_SOURCES, agents: CATALOG }, { headers: CACHE });
  }
  if (!db) return noDb();

  switch (name) {
    case "visits.csv": {
      const rows = await db
        .select({
          ts: visits.ts, path: visits.path, method: visits.method, agent: visits.agentSlug, operator: visits.operator, category: visits.category,
          verified: visits.verified, verified_by: visits.verifiedBy, signed: visits.signed, signature_agent: visits.signatureAgent,
          ip_prefix: visits.ipPrefix, country: visits.country, referer: visits.referer, robots_violation: visits.robotsViolation, trap_token: visits.trapToken, ua: visits.ua,
        })
        .from(visits)
        .orderBy(desc(visits.ts))
        .limit(LIMIT);
      return csv(name, toCsv(rows));
    }
    case "traffic_daily.csv": {
      const rows = await db.select().from(trafficDaily).orderBy(desc(trafficDaily.day)).limit(LIMIT);
      return csv(name, toCsv(rows));
    }
    case "wiki_edits.csv": {
      const rows = await db.select().from(wikiEdits).orderBy(desc(wikiEdits.ts)).limit(LIMIT);
      return csv(name, toCsv(rows));
    }
    case "github_daily.csv": {
      const rows = await db.select().from(githubDaily).orderBy(desc(githubDaily.day)).limit(LIMIT);
      return csv(name, toCsv(rows));
    }
    case "github_events.csv": {
      const rows = await db.select().from(githubEvents).orderBy(desc(githubEvents.createdAt)).limit(LIMIT);
      return csv(name, toCsv(rows));
    }
    case "forum_daily.csv": {
      const rows = await db.select().from(forumDaily).orderBy(desc(forumDaily.day)).limit(LIMIT);
      return csv(name, toCsv(rows));
    }
    case "guestbook.json": {
      const rows = await db
        .select({ id: guestbookNotes.id, ts: guestbookNotes.ts, name: guestbookNotes.name, operator: guestbookNotes.operator, purpose: guestbookNotes.purpose, note: guestbookNotes.note, agent: guestbookNotes.agentSlug, signed: guestbookNotes.signed })
        .from(guestbookNotes)
        .where(eq(guestbookNotes.hidden, false))
        .orderBy(desc(guestbookNotes.ts))
        .limit(LIMIT);
      return NextResponse.json({ notes: rows }, { headers: CACHE });
    }
    default:
      return NextResponse.json({ ok: false, reason: "unknown-export" }, { status: 404 });
  }
}
