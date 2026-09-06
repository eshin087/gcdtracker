/**
 * Self-disclosure signatures found in pull-request bodies and titles.
 * A hit means "an AI tool was named", never "an agent acted autonomously".
 */
export interface SignatureRule {
  id: string;
  label: string;
  re: RegExp;
}

const TOOLS = "claude code|claude|codex|openai codex|chatgpt|copilot|cursor|windsurf|jules|devin|aider|gemini(?: code assist| cli)?|kiro|amazon q|openhands|sweep";

export const SIGNATURE_RULES: SignatureRule[] = [
  {
    id: "generated-by",
    label: "Generated-with attribution",
    re: new RegExp(`(?:🤖\\s*)?generated (?:with|by|using) \\[?(?:${TOOLS})\\b`, "i"),
  },
  {
    id: "made-with",
    label: "Made-with attribution",
    re: new RegExp(`\\bmade (?:with|by|using) \\[?(?:${TOOLS})\\b`, "i"),
  },
  {
    id: "implemented-with",
    label: "Implementation attribution",
    re: new RegExp(`\\b(?:implemented|written|built|developed|authored|created|drafted) (?:with|by|using) (?:the )?(?:${TOOLS})(?: assistance| agent| ai)?\\b`, "i"),
  },
  {
    id: "ai-coauthor",
    label: "AI co-author trailer",
    re: new RegExp(`co-authored-by:\\s*(?:${TOOLS})\\b`, "i"),
  },
  {
    id: "aider",
    label: "aider commit prefix",
    re: /^aider:/im,
  },
];

/** Drop fenced code blocks and quoted lines so we only read the author's own words. */
export function stripQuotedAndFenced(text: string): string {
  const withoutFences = text.replace(/```[\s\S]*?```/g, " ");
  return withoutFences
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
}

export interface SignatureHit {
  ruleId: string;
  excerpt: string;
}

/** First matching line per rule. */
export function findSignatures(text: string | null | undefined): SignatureHit[] {
  if (!text) return [];
  const clean = stripQuotedAndFenced(text);
  const hits: SignatureHit[] = [];
  for (const rule of SIGNATURE_RULES) {
    const m = clean.match(rule.re);
    if (!m || m.index === undefined) continue;
    const lineStart = clean.lastIndexOf("\n", m.index) + 1;
    const lineEnd = clean.indexOf("\n", m.index);
    const line = clean.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
    hits.push({ ruleId: rule.id, excerpt: line.slice(0, 300) });
  }
  return hits;
}

export function signatureLabel(ruleId: string): string {
  return SIGNATURE_RULES.find((r) => r.id === ruleId)?.label ?? ruleId;
}

/** Canonical tool keys for the names the rules recognise. */
const TOOL_KEYS: Array<[RegExp, string]> = [
  [/claude/i, "claude"],
  [/codex/i, "codex"],
  [/chatgpt/i, "chatgpt"],
  [/copilot/i, "copilot"],
  [/cursor/i, "cursor"],
  [/windsurf/i, "windsurf"],
  [/jules/i, "jules"],
  [/devin/i, "devin"],
  [/aider/i, "aider"],
  [/gemini/i, "gemini"],
  [/kiro/i, "kiro"],
  [/amazon q/i, "amazon-q"],
  [/openhands/i, "openhands"],
  [/sweep/i, "sweep"],
];

/** Which tool a signature excerpt names, as a stable key (`claude`, `copilot`, …). */
export function namedTool(excerpt: string): string {
  const m = excerpt.match(new RegExp(`(?:with|by|using)\\s+(?:the\\s+)?\\[?(${TOOLS})|co-authored-by:\\s*(${TOOLS})|^(aider):`, "i"));
  const name = m ? (m[1] ?? m[2] ?? m[3] ?? "") : excerpt;
  for (const [re, key] of TOOL_KEYS) if (re.test(name)) return key;
  return "other";
}
