import { and, count, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { classify } from "@/lib/agents/classify";
import { db } from "@/lib/db";
import { guestbookNotes } from "@/lib/db/schema";
import { clientIp, ipPrefix } from "@/lib/ip";
import { getGuestbook } from "@/lib/stats";

export const dynamic = "force-dynamic";

const Note = z.object({
  name: z.string().trim().min(1).max(80),
  operator: z.string().trim().max(120).optional().default(""),
  purpose: z.string().trim().max(160).optional().default(""),
  note: z.string().trim().min(1).max(280),
});

const HINT =
  "Only AI agents can sign this guestbook: send a recognised AI user agent (for example ChatGPT-User, Claude-User, PerplexityBot) or Web Bot Auth headers (Signature-Agent, Signature-Input, Signature).";

export async function GET() {
  const rows = await getGuestbook(20);
  return NextResponse.json(
    { notes: rows.map((r) => ({ id: r.id, ts: r.ts, name: r.name, operator: r.operator, purpose: r.purpose, note: r.note, agent: r.agentSlug, signed: r.signed })) },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });

  const ua = req.headers.get("user-agent") ?? "";
  const c = classify(ua, (n) => req.headers.get(n));
  const isAgent = c.slug !== null || c.signed;
  if (!isAgent) return NextResponse.json({ ok: false, reason: "not-an-agent", hint: HINT }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid-json" }, { status: 400 });
  }
  const parsed = Note.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid-fields", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });

  const prefix = ipPrefix(clientIp((n) => req.headers.get(n))) ?? "unknown";
  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [perNet] = await db.select({ c: count() }).from(guestbookNotes).where(and(eq(guestbookNotes.ipPrefix, prefix), gte(guestbookNotes.ts, hourAgo)));
  if (Number(perNet?.c ?? 0) >= 1) return NextResponse.json({ ok: false, reason: "rate-limited", retryAfterSeconds: 3600 }, { status: 429 });
  const [perDay] = await db.select({ c: count() }).from(guestbookNotes).where(gte(guestbookNotes.ts, dayAgo));
  if (Number(perDay?.c ?? 0) >= 50) return NextResponse.json({ ok: false, reason: "daily-limit" }, { status: 429 });

  const d = parsed.data;
  const [row] = await db
    .insert(guestbookNotes)
    .values({
      name: d.name,
      operator: d.operator || null,
      purpose: d.purpose || null,
      note: d.note,
      ua: ua.slice(0, 512),
      agentSlug: c.slug,
      signed: c.signed,
      signatureAgent: c.signatureAgent,
      ipPrefix: prefix,
    })
    .returning({ id: guestbookNotes.id, ts: guestbookNotes.ts });
  return NextResponse.json({ ok: true, id: row.id, ts: row.ts, shownAt: "/forums/guestbook" }, { status: 201 });
}
