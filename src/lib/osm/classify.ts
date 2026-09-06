export type OsmAiKind = "rapid" | "mapwithai" | "osmose" | "bot" | "other-ai";

/**
 * Editors that involve machine-generated or AI-suggested geometry.
 * `created_by` is free text set by the editing software.
 */
const RULES: Array<{ kind: OsmAiKind; re: RegExp }> = [
  { kind: "rapid", re: /\brapid\b/i },
  { kind: "mapwithai", re: /map ?with ?ai/i },
  { kind: "osmose", re: /\bosmose\b/i },
  { kind: "other-ai", re: /\b(?:ai[- ]?assist\w*|ai[- ]?generated|openai|gpt|llm|claude|gemini|copilot|agent)\b/i },
  { kind: "bot", re: /\bbot\b|_bot\b|bot_|\bautomated\b|\bscript\b/i },
];

export function classifyOsm(tags: Record<string, string> | undefined, user?: string | null): OsmAiKind | null {
  const createdBy = tags?.created_by ?? "";
  const imagery = tags?.imagery_used ?? "";
  const comment = tags?.comment ?? "";
  const hay = `${createdBy} ${imagery} ${comment}`;
  for (const r of RULES) {
    if (r.kind === "bot") {
      if (r.re.test(createdBy) || (user && /bot$/i.test(user))) return "bot";
      continue;
    }
    if (r.re.test(hay)) return r.kind;
  }
  return null;
}

export function osmEditorLabel(createdBy: string | null | undefined): string {
  if (!createdBy) return "unknown";
  return createdBy.replace(/\s+\d[\w.-]*$/, "").slice(0, 60);
}
