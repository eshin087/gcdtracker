import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time Bearer check against CRON_SECRET. Missing secret means nobody is authorised. */
export function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
