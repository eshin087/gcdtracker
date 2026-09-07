import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { classify } from "@/lib/agents/classify";
import { isAiCategory } from "@/lib/agents/types";
import { db } from "@/lib/db";
import { clientIp, hashSalt, ipPrefix } from "@/lib/ip";
import { getGuestbook } from "@/lib/stats";
import { guestbookJson } from "@/lib/public-evidence";

export const dynamic = "force-dynamic";

const Note = z.object({
  name: z.string().trim().min(1).max(80),
  operator: z.string().trim().max(120).optional().default(""),
  purpose: z.string().trim().max(160).optional().default(""),
  note: z.string().trim().min(1).max(280),
});
const MAX_BODY_BYTES = 8192;
const HINT = "Send a recognised AI user agent, for example ChatGPT-User, Claude-User or PerplexityBot. This is self-declared; signature headers alone do not establish an AI identity.";

export async function GET() {
  const rows = await getGuestbook(20);
  return NextResponse.json(
    { notes: rows.map(guestbookJson) },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

export async function POST(req: Request) {
  if (!db) return NextResponse.json({ ok: false, reason: "no-database" }, { status: 503 });
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 512);
  const c = classify(ua, (name) => req.headers.get(name));
  if (!isAiCategory(c.category)) return NextResponse.json({ ok: false, reason: "not-an-agent", hint: HINT }, { status: 403 });
  if (!hashSalt()) return NextResponse.json({ ok: false, reason: "guestbook-unavailable" }, { status: 503 });
  const prefix = ipPrefix(clientIp((name) => req.headers.get(name)));
  if (!prefix) return NextResponse.json({ ok: false, reason: "client-identity-unavailable" }, { status: 503 });

  const declaredLength = Number(req.headers.get("content-length"));
  if (declaredLength > MAX_BODY_BYTES) return NextResponse.json({ ok: false, reason: "body-too-large" }, { status: 413 });
  let json: unknown;
  try {
    const reader = req.body?.getReader();
    if (!reader) throw new Error("empty body");
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0;
      let body = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          await reader.cancel();
          return NextResponse.json({ ok: false, reason: "body-too-large" }, { status: 413 });
        }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      json = JSON.parse(body);
    } finally {
      reader.releaseLock();
    }
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid-json" }, { status: 400 });
  }
  const parsed = Note.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "invalid-fields", issues: parsed.error.issues.map((issue) => issue.message) }, { status: 400 });

  const note = parsed.data;
  try {
    // Neon HTTP batches run in one transaction. The second statement gets a new
    // READ COMMITTED snapshot AFTER waiting for the lock; a same-statement CTE would not.
    const [, result] = await db.batch([
      db.execute(sql`select pg_advisory_xact_lock(731847, 1)`),
      db.execute(sql`
        with quota as (
          select
            count(*) filter (where ip_prefix = ${prefix} and ts >= now() - interval '1 hour') as per_network,
            count(*) as per_day,
            max(ts) filter (where ip_prefix = ${prefix} and ts >= now() - interval '1 hour') as network_last,
            min(ts) as daily_first
          from guestbook_notes where ts >= now() - interval '24 hours'
        ), inserted as (
          insert into guestbook_notes (name, operator, purpose, note, ua, agent_slug, signed, signature_agent, ip_prefix)
          select ${note.name}, ${note.operator || null}, ${note.purpose || null}, ${note.note},
            ${ua}, ${c.slug}, ${c.signed}, ${c.signatureAgent}, ${prefix}
          from quota where per_network < 1 and per_day < 50
          returning id, ts
        )
        select inserted.id, inserted.ts,
          case when quota.per_network >= 1 then 'rate-limited'
               when quota.per_day >= 50 then 'daily-limit' else 'ok' end as reason,
          case when quota.per_network >= 1
               then greatest(1, ceil(extract(epoch from quota.network_last + interval '1 hour' - now())))::int
               when quota.per_day >= 50
               then greatest(1, ceil(extract(epoch from quota.daily_first + interval '24 hours' - now())))::int
               else 0 end as retry_after
        from quota left join inserted on true
      `),
    ]);
    const row = result.rows[0] as { id: number | null; ts: Date | string | null; reason: string; retry_after: number } | undefined;
    if (row?.reason === "rate-limited" || row?.reason === "daily-limit") {
      const retryAfterSeconds = Math.max(1, Number(row.retry_after) || 3600);
      return NextResponse.json({ ok: false, reason: row.reason, retryAfterSeconds }, {
        status: 429, headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }
    if (!row?.id || !row.ts || row.reason !== "ok") throw new Error("guestbook insert returned no outcome");
    return NextResponse.json({ ok: true, id: row.id, ts: row.ts, shownAt: "/forums/guestbook" }, { status: 201 });
  } catch {
    // Database errors can contain bound note/header values; do not log their raw messages.
    console.error("guestbook write failed");
    return NextResponse.json({ ok: false, reason: "guestbook-unavailable" }, { status: 503 });
  }
}
