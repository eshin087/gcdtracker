import { sql, type SQL } from "drizzle-orm";
import {
  BLUESKY_ORIGIN, BLUESKY_SCOPE, MASTODON_ORIGINS, SOCIAL_COLLECTION_VERSION, SOCIAL_LIMITS,
  blueskyEvidence, mastodonEvidence, socialDay,
  type SampleEvidence, type SocialCoverage, type SocialPlatform, type SocialSample,
} from "@/lib/social-contract";
import { OUTBOUND_HEADERS, timeLeft, type Job, type JobContext, type JobOutcome } from "./common";
import { commitCollectorState, readCollectorState } from "./state";

export interface SocialState extends Record<string, unknown> {
  version: 1;
  day: string | null;
  status: "idle" | "reserved" | "completed" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  outcome: JobOutcome | null;
  reason: string | null;
}
export const INITIAL_SOCIAL_STATE: SocialState = { version: 1, day: null, status: "idle", startedAt: null, finishedAt: null, outcome: null, reason: null };
export const socialStateKey = (platform: SocialPlatform) => `social:${platform}:v${SOCIAL_COLLECTION_VERSION}`;

function coverage(platform: SocialPlatform, durationMs: number): SocialCoverage {
  const blue = platform === "bluesky";
  return {
    method: blue ? "jetstream-v2-live-create-sample" : "local-public-timeline-snapshot",
    representative: false, disclosureLanguage: "en", disclosureDefinition: "explicit-first-person-content-disclosure-v1", attribution: "unverified-text-signals",
    automatedAccountMeaning: blue ? "not-observed" : "self-designated-bot-not-necessarily-ai",
    includesReplies: false, includesBoosts: false, publisherFrom: null, publisherTo: null,
    requestedDurationMs: durationMs, maxRequests: blue ? 1 : 2,
    maxRecords: blue ? SOCIAL_LIMITS.bluesky.frames : SOCIAL_LIMITS.mastodon.postsPerInstance * 2,
    maxBytes: blue ? SOCIAL_LIMITS.bluesky.bytes : SOCIAL_LIMITS.mastodon.bytesPerInstance * 2,
    maxFrameBytes: blue ? SOCIAL_LIMITS.bluesky.frameBytes : null,
    receivedRecords: 0, receivedBytes: 0, excludedRecords: 0, invalidRecords: 0, duplicateRecords: 0, reasons: [], scopes: [],
  };
}

interface Counters { sampledPosts: number; aiDisclosurePosts: number; automatedAccountPosts: number }
const emptyCounters = (): Counters => ({ sampledPosts: 0, aiDisclosurePosts: 0, automatedAccountPosts: 0 });
function addEvidence(evidence: SampleEvidence, counts: Counters, meta: SocialCoverage, seen: Set<string>): void {
  if (seen.has(evidence.key)) { meta.duplicateRecords++; return; }
  seen.add(evidence.key);
  counts.sampledPosts++;
  counts.aiDisclosurePosts += Number(evidence.aiDisclosure);
  counts.automatedAccountPosts += Number(evidence.automatedAccount);
  if (!meta.publisherFrom || evidence.publisherAt < meta.publisherFrom) meta.publisherFrom = evidence.publisherAt;
  if (!meta.publisherTo || evidence.publisherAt > meta.publisherTo) meta.publisherTo = evidence.publisherAt;
}
export interface SocialObservation { sample: SocialSample | null; outcome: "success" | "partial" | "failed"; reason: string; failureReasons?: string[] }
function observation(platform: SocialPlatform, startedAt: string, counts: Counters, meta: SocialCoverage, reason: string, completed: boolean): SocialObservation {
  // No usable denominator means unavailable, including empty timelines which can indicate access restrictions.
  if (!counts.sampledPosts) return { sample: null, outcome: "failed", reason, failureReasons: [...new Set(meta.scopes.flatMap((scope) => scope.reason ? [scope.reason] : []))] };
  const outcome = completed && !meta.invalidRecords ? "success" : "partial";
  return { outcome, reason, sample: { platform, day: socialDay(new Date(startedAt)), collectionVersion: SOCIAL_COLLECTION_VERSION,
    startedAt, finishedAt: new Date().toISOString(), ...counts, scopes: meta.scopes.map((s) => s.scope), outcome, coverage: meta } };
}

export const BLUESKY_STREAM_URL = `${BLUESKY_ORIGIN.replace("https:", "wss:")}/xrpc/network.bsky.jetstream.subscribeEvents?kinds=commit&collections=app.bsky.feed.post&maxMessageSizeBytes=${SOCIAL_LIMITS.bluesky.frameBytes}`;

/** One finite live-tip connection. No archive, catch-up, reconnect, media fetch or paid inference. */
export async function sampleBluesky(durationMs: number = SOCIAL_LIMITS.bluesky.durationMs): Promise<SocialObservation> {
  const duration = Math.max(1, Math.min(durationMs, SOCIAL_LIMITS.bluesky.durationMs));
  const startedAt = new Date().toISOString();
  const meta = coverage("bluesky", duration);
  const counts = emptyCounters();
  const seen = new Set<string>();
  meta.reasons.push("bounded-live-tip-sample", "oversized-server-frames-excluded", "create-events-not-current-post-inventory");
  return new Promise((resolve) => {
    let socket: WebSocket | undefined;
    let settled = false;
    const finish = (reason: string, completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket) {
        socket.onmessage = null;
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        try { socket.close(1000, "bounded sample finished"); } catch { /* already closed */ }
      }
      meta.reasons.push(reason);
      meta.scopes.push({ scope: BLUESKY_SCOPE, outcome: completed && counts.sampledPosts > 0 ? "success" : "failed", reason, sampledPosts: counts.sampledPosts });
      resolve(observation("bluesky", startedAt, counts, meta, reason, completed));
    };
    const timer = setTimeout(() => finish(counts.sampledPosts ? "duration-limit" : "no-usable-observations", true), duration);
    try {
      socket = new WebSocket(BLUESKY_STREAM_URL, "xrpc.v1.json");
      socket.binaryType = "arraybuffer";
      socket.onerror = () => finish("stream-unavailable", false);
      socket.onclose = () => finish("stream-closed-early", false);
      socket.onmessage = (event) => {
        if (settled) return;
        meta.receivedRecords++;
        const size = typeof event.data === "string" ? Buffer.byteLength(event.data, "utf8") : event.data instanceof ArrayBuffer ? event.data.byteLength : SOCIAL_LIMITS.bluesky.frameBytes + 1;
        meta.receivedBytes += size;
        if (size > SOCIAL_LIMITS.bluesky.frameBytes || meta.receivedBytes > SOCIAL_LIMITS.bluesky.bytes) { finish("byte-limit", false); return; }
        if (typeof event.data !== "string") { finish("unexpected-binary-frame", false); return; }
        try {
          const parsed = blueskyEvidence(JSON.parse(event.data));
          if (parsed.kind === "error") { finish("upstream-protocol-error", false); return; }
          if (parsed.kind === "post") addEvidence(parsed.evidence, counts, meta, seen);
          else if (parsed.kind === "invalid") meta.invalidRecords++;
          else meta.excludedRecords++;
        } catch { meta.invalidRecords++; }
        if (meta.receivedRecords >= SOCIAL_LIMITS.bluesky.frames) finish("frame-limit", true);
      };
    } catch { finish("websocket-unavailable", false); }
  });
}

/** Bounded streaming body reader: no whole-response json() before the byte limit. */
export async function boundedSocialJson(response: Response, maxBytes: number): Promise<{ value: unknown; bytes: number }> {
  if (!response.body) throw new Error("empty-body");
  const reader = response.body.getReader();
  const declared = Number(response.headers.get("content-length"));
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error("byte-limit");
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error("byte-limit");
      chunks.push(chunk.value);
    }
    const joined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return { value: JSON.parse(new TextDecoder().decode(joined)), bytes };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Two fixed unauthenticated origins, one local page each, with no redirects or retries. */
export async function sampleMastodon(durationMs: number = SOCIAL_LIMITS.mastodon.durationMs): Promise<SocialObservation> {
  const duration = Math.max(1, Math.min(durationMs, SOCIAL_LIMITS.mastodon.durationMs));
  const startedAt = new Date().toISOString();
  const meta = coverage("mastodon", duration);
  const counts = emptyCounters();
  const seen = new Set<string>();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), duration);
  meta.reasons.push("selected-instance-latest-post-snapshot", "not-a-full-day-count", "bot-flags-do-not-establish-ai");
  try {
    const pages = await Promise.all(MASTODON_ORIGINS.map(async (origin) => {
      try {
        const response = await fetch(`${origin}/api/v1/timelines/public?local=true&limit=${SOCIAL_LIMITS.mastodon.postsPerInstance}`, {
          headers: OUTBOUND_HEADERS, cache: "no-store", redirect: "error", signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          return { origin, reason: response.status === 429 ? "rate-limited" : [401, 403, 422].includes(response.status) ? "access-restricted" : "upstream-unavailable" };
        }
        const body = await boundedSocialJson(response, SOCIAL_LIMITS.mastodon.bytesPerInstance);
        if (!Array.isArray(body.value) || body.value.length > SOCIAL_LIMITS.mastodon.postsPerInstance) return { origin, reason: "invalid-response" };
        if (!body.value.length) return { origin, reason: "empty-or-disabled-timeline" };
        return { origin, body, reason: null };
      } catch (error) {
        return { origin, reason: controller.signal.aborted ? "duration-limit" : error instanceof Error && error.message === "byte-limit" ? "byte-limit" : "request-failed" };
      }
    }));
    for (const page of pages) {
      const before = counts.sampledPosts;
      if (page.body) {
        meta.receivedBytes += page.body.bytes;
        for (const value of page.body.value as unknown[]) {
          meta.receivedRecords++;
          const parsed = mastodonEvidence(value, page.origin);
          if (parsed.kind === "post") addEvidence(parsed.evidence, counts, meta, seen);
          else if (parsed.kind === "invalid") meta.invalidRecords++;
          else meta.excludedRecords++;
        }
      }
      const reason = page.reason ?? (counts.sampledPosts === before ? "no-eligible-original-posts" : null);
      meta.scopes.push({ scope: page.origin, outcome: reason ? "failed" : "success", reason, sampledPosts: counts.sampledPosts - before });
      if (reason) meta.reasons.push(reason);
    }
    const complete = meta.scopes.every((s) => s.outcome === "success");
    return observation("mastodon", startedAt, counts, meta, complete ? "snapshot-complete" : "incomplete-instance-coverage", complete);
  } finally { clearTimeout(timer); }
}

/** A completed UTC sample is immutable; the checkpoint and aggregate commit together. */
export function socialSampleWrite(sample: SocialSample, guard: SQL): SQL {
  return sql`insert into social_samples (platform, day, collection_version, started_at, finished_at,
      sampled_posts, ai_disclosure_posts, automated_account_posts, scopes, outcome, coverage)
    select ${sample.platform}, ${sample.day}::date, ${sample.collectionVersion}, ${sample.startedAt}::timestamptz, ${sample.finishedAt}::timestamptz,
      ${sample.sampledPosts}, ${sample.aiDisclosurePosts}, ${sample.automatedAccountPosts}, ${JSON.stringify(sample.scopes)}::jsonb,
      ${sample.outcome}, ${JSON.stringify(sample.coverage)}::jsonb
    where ${guard} on conflict (platform, day, collection_version) do nothing`;
}

/** Reservation survives failures. Retries/manual calls cannot open more samples that UTC day. */
export async function runSocialJob(ctx: JobContext, platform: SocialPlatform, sample: (durationMs: number) => Promise<SocialObservation>): Promise<Awaited<ReturnType<Job>>> {
  if (process.env.SOCIAL_COLLECTION_ENABLED === "0") return { outcome: "disabled", stats: { reason: "configured-disabled", version: SOCIAL_COLLECTION_VERSION } };
  if (timeLeft(ctx) < 2500) return { outcome: "partial", stats: { reason: "insufficient-time", version: SOCIAL_COLLECTION_VERSION } };
  const key = socialStateKey(platform);
  const snapshot = await readCollectorState(ctx.db, key, INITIAL_SOCIAL_STATE);
  const startedAt = new Date().toISOString();
  const day = socialDay(new Date(startedAt));
  if (snapshot.state.day && snapshot.state.day >= day) {
    return { outcome: snapshot.state.outcome ?? "partial", stats: { version: SOCIAL_COLLECTION_VERSION, day: snapshot.state.day, alreadyAttempted: true, reason: snapshot.state.reason ?? "sample-reserved" } };
  }
  const reserved: SocialState = { version: 1, day, status: "reserved", startedAt, finishedAt: null, outcome: null, reason: null };
  const acquired = await commitCollectorState(ctx.db, key, snapshot, reserved);
  if (!acquired) return { outcome: "partial", stats: { version: SOCIAL_COLLECTION_VERSION, day, alreadyAttempted: true, reason: "reservation-contended" } };
  let result: SocialObservation;
  try {
    const remaining = timeLeft(ctx) - 1500;
    result = remaining > 0 ? await sample(Math.min(remaining, SOCIAL_LIMITS[platform].durationMs)) : { sample: null, outcome: "failed", reason: "deadline-before-sample" };
  } catch { result = { sample: null, outcome: "failed", reason: "sample-failed" }; }
  // An invocation crossing midnight still belongs to its reserved sampling day.
  if (result.sample) result.sample.day = day;
  const next: SocialState = { ...reserved, status: result.sample ? "completed" : "failed", finishedAt: new Date().toISOString(), outcome: result.outcome, reason: result.reason };
  const committed = await commitCollectorState(ctx.db, key, { state: reserved, revision: snapshot.revision + 1 }, next,
    (guard) => result.sample ? [socialSampleWrite(result.sample, guard)] : []);
  if (!committed) return { outcome: "failed", error: "social sample commit was superseded", stats: { version: SOCIAL_COLLECTION_VERSION, day } };
  return { outcome: result.outcome, stats: { version: SOCIAL_COLLECTION_VERSION, day, reason: result.reason,
    ...(result.failureReasons ? { failureReasons: result.failureReasons } : {}),
    ...(result.sample ? { sampledPosts: result.sample.sampledPosts, aiDisclosurePosts: result.sample.aiDisclosurePosts,
      automatedAccountPosts: result.sample.automatedAccountPosts, samplingWindowFrom: result.sample.startedAt, samplingWindowTo: result.sample.finishedAt } : { missing: true }) } };
}

export const blueskyJob: Job = (ctx) => runSocialJob(ctx, "bluesky", sampleBluesky);
export const mastodonJob: Job = (ctx) => runSocialJob(ctx, "mastodon", sampleMastodon);
