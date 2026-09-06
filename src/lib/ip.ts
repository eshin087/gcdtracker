import { createHash } from "node:crypto";
import { isIP } from "node:net";

/** Client IP from Vercel's forwarding headers (x-forwarded-for is set by Vercel, not spoofable). */
export function clientIp(getHeader: (name: string) => string | null | undefined): string | null {
  const xff = getHeader("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim() ?? null;
  const candidate = first || getHeader("x-real-ip")?.trim() || null;
  return candidate && isIP(candidate) ? candidate : null;
}

/** Expand an IPv6 address to 8 hextets (lowercase, no leading-zero trimming needed for prefixing). */
export function expandIPv6(ip: string): string[] | null {
  if (isIP(ip) !== 6) return null;
  let addr = ip;
  // IPv4-mapped tail, e.g. ::ffff:1.2.3.4
  const v4 = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    addr = addr.replace(v4[0], `${hi}:${lo}`);
  }
  const [head, tail] = addr.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;
  const parts = [...headParts, ...Array(addr.includes("::") ? missing : 0).fill("0"), ...tailParts];
  if (parts.length !== 8) return null;
  return parts.map((p) => p.toLowerCase());
}

/** a.b.c.0/24 for IPv4, first three hextets /48 for IPv6. Never the full address. */
export function ipPrefix(ip: string | null): string | null {
  if (!ip) return null;
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".");
    return `${a}.${b}.${c}.0/24`;
  }
  if (v === 6) {
    const parts = expandIPv6(ip);
    if (!parts) return null;
    return `${parts[0]}:${parts[1]}:${parts[2]}::/48`;
  }
  return null;
}

let cachedSalt: string | null = null;

/** Salt derived from the one secret the deployment already has. */
export function hashSalt(): string {
  if (cachedSalt) return cachedSalt;
  const secret = process.env.CRON_SECRET ?? "development-salt";
  cachedSalt = createHash("sha256").update(`ip:${secret}`).digest("hex");
  return cachedSalt;
}

/** 16 hex chars; lets us count distinct sources without storing addresses. */
export function ipHash(ip: string | null, salt: string = hashSalt()): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}
