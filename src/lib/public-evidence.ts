import { findAgent } from "@/lib/agents/catalog";
import type { Category } from "@/lib/agents/types";
import { visits, guestbookNotes } from "@/lib/db/schema";
import { ALL_LINKS } from "@/lib/site";
import { trapPlacement, type TrapPlacement } from "@/lib/trap";

export type SignatureStatus = "absent" | "unverified";
export type PublicTrapPlacement = TrapPlacement | "private" | "unknown" | null;
export const signatureStatus = (observed: boolean): SignatureStatus => observed ? "unverified" : "absent";

/** Only catalog metadata may become a public visitor identity. Legacy header-derived slugs are private. */
export function publicAgentIdentity(slug: string | null) {
  const agent = slug ? findAgent(slug) : undefined;
  return { agentSlug: agent?.slug ?? null, agentName: agent?.name ?? null, operator: agent?.operator ?? null };
}

const PUBLIC_PATHS = new Set([
  ...ALL_LINKS.map((link) => link.href),
  "/robots.txt", "/llms.txt", "/sitemap.xml",
  "/visitors/day", "/visitors/agents", "/visitors/violations", "/visitors/recent",
  "/wikipedia/editors", "/wikipedia/wikimedia", "/wikipedia/edits",
  "/github/census", "/github/day", "/github/agents", "/github/prs", "/github/watched", "/github/signals",
  "/forums/day", "/forums/posts", "/forums/guestbook",
]);

/** Publish route buckets, never arbitrary visitor-supplied paths, queries, or identifiers. */
export function publicPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (PUBLIC_PATHS.has(pathname)) return pathname;
  if (pathname.startsWith("/trap/")) return "/trap/[token]";
  if (pathname.startsWith("/private/")) return "/private/[path]";
  if (pathname.startsWith("/agents/")) return "/agents/[slug]";
  if (pathname.startsWith("/investigations/")) return "/investigations/[slug]";
  if (/^\/wikipedia\/edits\/(?:all|1|2)(?:\/[1-9]\d*)?$/.test(pathname)) return "/wikipedia/edits";
  if (/^\/github\/signals\/(?:all|unreviewed|needs_evidence|confirmed|dismissed)$/.test(pathname)) return "/github/signals";
  return "/other";
}

export function publicTrapPlacement(token: string | null): PublicTrapPlacement {
  if (!token) return null;
  return token === "private" ? "private" : trapPlacement(token);
}

/** Explicit DB projection: no IP, UA, referrer, or Signature-Agent is selected for rendering. */
export const visitEvidenceColumns = {
  id: visits.id, ts: visits.ts, day: visits.day, path: visits.path, method: visits.method,
  agentSlug: visits.agentSlug, category: visits.category, verified: visits.verified,
  verifiedBy: visits.verifiedBy, signed: visits.signed, country: visits.country,
  robotsViolation: visits.robotsViolation, trapToken: visits.trapToken,
};
type VisitEvidence = Pick<typeof visits.$inferSelect, keyof typeof visitEvidenceColumns>;

export interface PublicVisit {
  id: number;
  ts: Date;
  day: string;
  path: string;
  method: string;
  agentSlug: string | null;
  agentName: string | null;
  operator: string | null;
  category: Category;
  verified: boolean | null;
  verifiedBy: string | null;
  /** @deprecated Signature header presence only; use signatureStatus. */
  signed: boolean;
  signatureStatus: SignatureStatus;
  country: string | null;
  robotsViolation: boolean;
  trapPlacement: PublicTrapPlacement;
}

export function publicVisit(row: VisitEvidence): PublicVisit {
  const identity = publicAgentIdentity(row.agentSlug);
  return {
    id: row.id, ts: row.ts, day: row.day, path: publicPath(row.path), method: row.method,
    ...identity,
    category: row.category as Category,
    verified: identity.agentSlug ? row.verified : null,
    verifiedBy: identity.agentSlug ? row.verifiedBy : null,
    signed: row.signed, signatureStatus: signatureStatus(row.signed),
    country: row.country && /^[A-Z]{2}$/.test(row.country) ? row.country : null,
    robotsViolation: row.robotsViolation,
    trapPlacement: row.robotsViolation ? publicTrapPlacement(row.trapToken) : null,
  };
}

export const guestbookEvidenceColumns = {
  id: guestbookNotes.id, ts: guestbookNotes.ts, name: guestbookNotes.name,
  operator: guestbookNotes.operator, purpose: guestbookNotes.purpose, note: guestbookNotes.note,
  agentSlug: guestbookNotes.agentSlug, signed: guestbookNotes.signed,
};
type GuestbookEvidence = Pick<typeof guestbookNotes.$inferSelect, keyof typeof guestbookEvidenceColumns>;
export type PublicGuestbookNote = GuestbookEvidence & { signatureStatus: SignatureStatus };

export function publicGuestbookNote(row: GuestbookEvidence): PublicGuestbookNote {
  return {
    id: row.id, ts: row.ts, name: row.name, operator: row.operator, purpose: row.purpose, note: row.note,
    agentSlug: publicAgentIdentity(row.agentSlug).agentSlug,
    signed: row.signed, signatureStatus: signatureStatus(row.signed),
  };
}

export function guestbookJson(row: PublicGuestbookNote) {
  return {
    id: row.id, ts: row.ts, name: row.name, operator: row.operator, purpose: row.purpose, note: row.note,
    agent: row.agentSlug, signed: row.signed, signatureStatus: row.signatureStatus,
  };
}

export const VISIT_CSV_COLUMNS = [
  "ts", "path", "method", "agent", "operator", "category", "verified", "verified_by",
  "signed", "signature_status", "country", "robots_violation", "trap_placement",
] as const;

export function visitCsvRow(row: PublicVisit) {
  return {
    ts: row.ts, path: row.path, method: row.method, agent: row.agentSlug, operator: row.operator,
    category: row.category, verified: row.verified, verified_by: row.verifiedBy,
    signed: row.signed, signature_status: row.signatureStatus, country: row.country,
    robots_violation: row.robotsViolation, trap_placement: row.trapPlacement,
  };
}
