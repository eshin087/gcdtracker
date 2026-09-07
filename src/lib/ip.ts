import { createHash } from "node:crypto";
import { isIP } from "node:net";

/** Client IP from Vercel's overwritten forwarding headers. Other hosts must supply a trusted proxy. */
export function clientIp(getHeader: (name: string) => string | null | undefined): string | null {
  const first = getHeader("x-forwarded-for")?.split(",")[0]?.trim();
  return canonicalIp(first || getHeader("x-real-ip")?.trim() || null);
}

/** Expand IPv6 into eight normalized hextets. Scoped addresses are not public client IPs. */
export function expandIPv6(ip: string): string[] | null {
  if (ip.includes("%") || isIP(ip) !== 6) return null;
  let addr = ip;
  const v4 = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    addr = addr.replace(v4[0], ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16));
  }
  const [head, tail] = addr.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;
  const parts = [...headParts, ...Array(addr.includes("::") ? missing : 0).fill("0"), ...tailParts];
  return parts.length === 8 ? parts.map((p) => Number.parseInt(p, 16).toString(16)) : null;
}

/** One spelling per address; IPv4-mapped IPv6 shares the IPv4 identity. */
export function canonicalIp(ip: string | null): string | null {
  if (!ip) return null;
  if (isIP(ip) === 4) return ip;
  const parts = expandIPv6(ip);
  if (!parts) return null;
  if (parts.slice(0, 5).every((p) => p === "0") && parts[5] === "ffff") {
    const hi = Number.parseInt(parts[6], 16);
    const lo = Number.parseInt(parts[7], 16);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return parts.join(":");
}

/** Internal network key: a.b.c.0/24 for IPv4 or the first three hextets /48 for IPv6. */
export function ipPrefix(ip: string | null): string | null {
  const canonical = canonicalIp(ip);
  if (!canonical) return null;
  if (isIP(canonical) === 4) return canonical.split(".").slice(0, 3).join(".") + ".0/24";
  return canonical.split(":").slice(0, 3).join(":") + "::/48";
}

/** No predictable fallback. An optional dedicated secret can be rotated independently. */
export function hashSalt(): string | null {
  const secret = process.env.IP_HASH_SECRET || process.env.CRON_SECRET;
  return secret ? createHash("sha256").update("ip:" + secret).digest("hex") : null;
}

/** Private, secret-salted identifier. Disabled when no secret is configured. */
export function ipHash(ip: string | null, salt: string | null = hashSalt()): string | null {
  const canonical = canonicalIp(ip);
  if (!canonical || !salt) return null;
  return createHash("sha256").update(salt + ":" + canonical).digest("hex").slice(0, 16);
}
