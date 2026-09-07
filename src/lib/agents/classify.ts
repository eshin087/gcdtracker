import { CATALOG } from "./catalog";
import type { AgentDef, Category } from "./types";

export interface Classification {
  slug: string | null;
  name: string | null;
  operator: string | null;
  category: Category;
  /** the catalog token that matched */
  token: string | null;
  /** @deprecated Header presence only, never cryptographic verification. */
  signed: boolean;
  signatureStatus: "absent" | "unverified";
  /** host from the Signature-Agent header, e.g. "chatgpt.com" */
  signatureAgent: string | null;
}

export type HeaderGetter = (name: string) => string | null | undefined;

interface Matcher {
  def: AgentDef;
  token: string;
  re: RegExp;
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary style lookarounds that also treat "-" as part of a token,
// so "Claude" never matches inside "Claude-User" and "SearchBot" never
// matches inside "OAI-SearchBot".
const LB = "(?<![A-Za-z0-9-])";
const LA = "(?![A-Za-z0-9-])";

function buildMatchers(): Matcher[] {
  const out: Matcher[] = [];
  for (const def of CATALOG) {
    for (const token of def.tokens) {
      out.push({ def, token, re: new RegExp(`${LB}${esc(token)}${LA}`, "i") });
    }
    for (const token of def.prefixTokens ?? []) {
      out.push({ def, token, re: new RegExp(`${LB}${esc(token)}`, "i") });
    }
  }
  // longest token first so the most specific match wins
  return out.sort((a, b) => b.token.length - a.token.length);
}

const MATCHERS = buildMatchers();

/** Generic automation fingerprints. Anything matching is "other-bot", never "human". */
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|fetch|scrap|python|curl\/|wget|go-http|okhttp|axios|headless|http[_-]?client|libwww|node-fetch|undici|got\/|guzzle|apache-httpclient|phantomjs|selenium|puppeteer|playwright|monitor|uptime|probe|validator|preview|archive\.org|feed|rss|java\/|ruby|perl|php\/|dart\/|postman|insomnia/i;

export interface UAMatch {
  def: AgentDef | null;
  category: Category;
  token: string | null;
}

export function classifyUA(ua: string | null | undefined): UAMatch {
  const s = (ua ?? "").trim();
  if (!s) return { def: null, category: "other-bot", token: null };
  for (const m of MATCHERS) {
    if (m.re.test(s)) return { def: m.def, category: m.def.category, token: m.token };
  }
  if (BOT_RE.test(s)) return { def: null, category: "other-bot", token: null };
  return { def: null, category: "human", token: null };
}

function stripQuotes(v: string): string {
  return v.trim().replace(/^"+|"+$/g, "");
}

export function signatureAgentHost(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  const raw = stripQuotes(value);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.host.toLowerCase().slice(0, 256) || null;
  } catch {
    return null;
  }
}

export function classify(ua: string | null | undefined, headers: HeaderGetter): Classification {
  const m = classifyUA(ua);
  const sigAgent = headers("signature-agent");
  const signed = Boolean(sigAgent && headers("signature-input") && headers("signature"));
  const signatureStatus = signed ? "unverified" : "absent";
  const signatureAgent = signed ? signatureAgentHost(sigAgent) : null;

  if (m.def) {
    return {
      slug: m.def.slug,
      name: m.def.name,
      operator: m.def.operator,
      category: m.def.category,
      token: m.token,
      signed,
      signatureStatus,
      signatureAgent,
    };
  }
  // Header presence is an observation, never proof of an AI identity.
  return { slug: null, name: null, operator: null, category: m.category, token: null, signed, signatureStatus, signatureAgent };
}
