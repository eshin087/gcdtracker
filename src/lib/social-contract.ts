/** Aggregate-only public social samples. Counts are never estimates of platform totals. */
export const SOCIAL_COLLECTION_VERSION = 1;
export const SOCIAL_PLATFORMS = ["bluesky", "mastodon"] as const;
export type SocialPlatform = typeof SOCIAL_PLATFORMS[number];

export const SOCIAL_LIMITS = {
  bluesky: { durationMs: 8000, frames: 300, bytes: 262144, frameBytes: 65536, requests: 1 },
  mastodon: { durationMs: 6000, postsPerInstance: 40, bytesPerInstance: 262144, requests: 2 },
} as const;

export const MASTODON_ORIGINS = ["https://mastodon.world", "https://fosstodon.org"] as const;
export const BLUESKY_ORIGIN = "https://jetstream.us-west.bsky.network";
export const BLUESKY_SCOPE = `${BLUESKY_ORIGIN}/app.bsky.feed.post`;
export const SOCIAL_SOURCE_DOCS = {
  bluesky: "https://github.com/bluesky-social/jetstream/blob/main/lexicons/network/bsky/jetstream/subscribeEvents.json",
  mastodon: "https://docs.joinmastodon.org/methods/timelines/",
} as const;

export interface SocialCoverage {
  method: "jetstream-v2-live-create-sample" | "local-public-timeline-snapshot";
  representative: false;
  disclosureLanguage: "en";
  disclosureDefinition: "explicit-first-person-content-disclosure-v1";
  attribution: "unverified-text-signals";
  automatedAccountMeaning: "not-observed" | "self-designated-bot-not-necessarily-ai";
  includesReplies: false;
  includesBoosts: false;
  /** API/server display times, not proof of original authorship time. */
  publisherFrom: string | null;
  publisherTo: string | null;
  requestedDurationMs: number;
  maxRequests: number;
  maxRecords: number;
  /** Decoded processing budget; framing and the last received chunk may exceed it. */
  maxBytes: number;
  maxFrameBytes: number | null;
  receivedRecords: number;
  receivedBytes: number;
  excludedRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  reasons: string[];
  scopes: Array<{ scope: string; outcome: "success" | "failed"; reason: string | null; sampledPosts: number }>;
}

export interface SocialSample {
  platform: SocialPlatform;
  day: string;
  collectionVersion: number;
  startedAt: string;
  finishedAt: string;
  sampledPosts: number;
  aiDisclosurePosts: number;
  automatedAccountPosts: number;
  scopes: string[];
  outcome: "success" | "partial";
  coverage: SocialCoverage;
}

export function socialDay(now: Date): string { return now.toISOString().slice(0, 10); }

/** Deliberately narrow English signals. Quoting these words or lying remains possible. */
export function hasAiDisclosure(text: string): boolean {
  const tool = "(?:AI|artificial intelligence|ChatGPT|Claude|Gemini|DALL[ -]?E|Midjourney|Stable Diffusion)";
  const content = "(?:post|text|image|picture|artwork|illustration|video|audio|music|song|article|caption|code)";
  const self = new RegExp(`^I (?:used|use) ${tool} to (?:write|generate|create|draft|make) (?:this|the following) ${content}\\b`, "i");
  const declared = new RegExp(`^This ${content} (?:was|is) (?:AI[- ]generated|(?:generated|written|created|drafted|made) (?:with|by|using) ${tool})\\b`, "i");
  return text.slice(0, 20000).split(/\r?\n/).some((line) => {
    const value = line.trim().replace(/^(?:AI disclosure|Disclosure):\s*/i, "");
    return self.test(value) || declared.test(value);
  });
}

/** Extract only visible local text; linked targets, quote blocks and markup are not evidence. */
export function mastodonDisclosureText(html: string): string {
  return html.slice(0, 100000)
    .replace(/<(blockquote|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/(?:p|div|li)>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&");
}

export interface SampleEvidence {
  /** Kept only in memory to suppress retries/duplicates; never written to the database. */
  key: string;
  publisherAt: string;
  aiDisclosure: boolean;
  automatedAccount: boolean;
}
type ParsedEvidence = { kind: "post"; evidence: SampleEvidence } | { kind: "excluded" | "invalid" | "error" };

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function timestamp(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

/** Current v2 envelope only. No legacy cursor translation or historical replay. */
export function blueskyEvidence(value: unknown): ParsedEvidence {
  const envelope = record(value);
  if (envelope?.$type === "error") return { kind: "error" };
  if (envelope?.$type !== "message") return { kind: "invalid" };
  const event = record(envelope.payload);
  if (event?.$type !== "network.bsky.jetstream.subscribeEvents#commit") return { kind: "invalid" };
  if (event.collection !== "app.bsky.feed.post" || event.operation !== "create") return { kind: "excluded" };
  const post = record(event.record);
  const published = timestamp(event.time);
  if (!post || post.$type !== "app.bsky.feed.post" || typeof post.text !== "string" || !published || !Number.isSafeInteger(event.seq)
    || typeof event.did !== "string" || !event.did.startsWith("did:") || event.did.length > 300 || typeof event.rkey !== "string" || event.rkey.length > 512) return { kind: "invalid" };
  if (post.reply != null) return { kind: "excluded" };
  return { kind: "post", evidence: { key: `${event.did}/${event.rkey}`, publisherAt: published, aiDisclosure: hasAiDisclosure(post.text), automatedAccount: false } };
}

/** Local original public statuses only; a bot flag is evidence of declared automation, not AI. */
export function mastodonEvidence(value: unknown, origin: string): ParsedEvidence {
  const post = record(value);
  if (!post) return { kind: "invalid" };
  if (post.reblog != null || post.in_reply_to_id != null || post.visibility !== "public") return { kind: "excluded" };
  const account = record(post.account);
  const published = timestamp(post.created_at);
  if (typeof post.id !== "string" || !/^\d{1,40}$/.test(post.id) || typeof post.content !== "string" || !published || !account || typeof account.bot !== "boolean") return { kind: "invalid" };
  return { kind: "post", evidence: { key: `${origin}/${post.id}`, publisherAt: published, aiDisclosure: hasAiDisclosure(mastodonDisclosureText(post.content)), automatedAccount: account.bot } };
}
