/** Legacy token mapping used only to sanitize historical visitor exports. */
export const TRAP_TOKENS = {
  footer: "f7k2-hidden-footer-link",
  robots: "r4q9-robots-disallow-only",
  llms: "l8m3-llms-txt-only",
} as const;

export type TrapPlacement = keyof typeof TRAP_TOKENS;

export function trapPlacement(token: string): TrapPlacement | "unknown" {
  for (const [key, value] of Object.entries(TRAP_TOKENS)) {
    if (value === token) return key as TrapPlacement;
  }
  return "unknown";
}
