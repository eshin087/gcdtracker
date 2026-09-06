/**
 * Honeypot paths. Each token is only ever exposed in one place, so a hit tells
 * us how the visitor found it:
 *  - footer: a hidden link in the page footer (aria-hidden, nofollow, off-screen)
 *  - robots: listed ONLY as a Disallow line in robots.txt
 *  - llms:   mentioned ONLY in llms.txt
 */
export const TRAP_PREFIX = "/trap/";

export const TRAP_TOKENS = {
  footer: "f7k2-hidden-footer-link",
  robots: "r4q9-robots-disallow-only",
  llms: "l8m3-llms-txt-only",
} as const;

export type TrapPlacement = keyof typeof TRAP_TOKENS;

export function trapPath(placement: TrapPlacement): string {
  return `${TRAP_PREFIX}${TRAP_TOKENS[placement]}`;
}

export function trapPlacement(token: string): TrapPlacement | "unknown" {
  for (const [k, v] of Object.entries(TRAP_TOKENS)) {
    if (v === token) return k as TrapPlacement;
  }
  return "unknown";
}

export function isTrapPath(pathname: string): boolean {
  return pathname.startsWith(TRAP_PREFIX) || pathname.startsWith("/private/");
}
