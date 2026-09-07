export type GithubTier = "bot-account" | "branch-prefix";

export interface GithubAgent {
  /** stable key stored in github_daily.agent */
  key: string;
  label: string;
  vendor: string;
  /** GitHub search qualifier appended to `is:pr created:<day>` */
  query: string;
  tier: GithubTier;
  /** numeric user id (bot accounts) */
  id?: number;
  url?: string;
  note?: string;
}

/**
 * Verified on 2026-09-06 against api.github.com/users/<login>.
 * Bot accounts are keyed by numeric id because Copilot's login differs between
 * search (`app/copilot-swe-agent`) and results (`Copilot`).
 */
export const GITHUB_AGENTS: GithubAgent[] = [
  { key: "copilot", label: "GitHub Copilot coding agent", vendor: "GitHub", query: "author:app/copilot-swe-agent", tier: "bot-account", id: 198982749, url: "https://github.com/apps/copilot-swe-agent" },
  { key: "claude", label: "Claude Code", vendor: "Anthropic", query: "author:app/claude", tier: "bot-account", id: 209825114, url: "https://github.com/apps/claude" },
  { key: "codex-connector", label: "OpenAI Codex (connector)", vendor: "OpenAI", query: "author:app/chatgpt-codex-connector", tier: "bot-account", id: 199175422, url: "https://github.com/apps/chatgpt-codex-connector", note: "Codex pushes most PRs under the user's own account; see the codex/ branch fingerprint." },
  { key: "devin", label: "Devin", vendor: "Cognition", query: "author:app/devin-ai-integration", tier: "bot-account", id: 158243242, url: "https://github.com/apps/devin-ai-integration" },
  { key: "jules", label: "Jules", vendor: "Google", query: "author:app/google-labs-jules", tier: "bot-account", id: 161369871, url: "https://github.com/apps/google-labs-jules" },
  { key: "gemini-code-assist", label: "Gemini Code Assist", vendor: "Google", query: "author:app/gemini-code-assist", tier: "bot-account", id: 176961590, url: "https://github.com/apps/gemini-code-assist" },
  { key: "cursor", label: "Cursor", vendor: "Anysphere", query: "author:app/cursor", tier: "bot-account", id: 206951365, url: "https://github.com/apps/cursor" },
  { key: "coderabbit", label: "CodeRabbit", vendor: "CodeRabbit", query: "author:app/coderabbitai", tier: "bot-account", id: 136622811, url: "https://github.com/apps/coderabbitai" },
  { key: "amazon-q", label: "Amazon Q Developer", vendor: "Amazon", query: "author:app/amazon-q-developer", tier: "bot-account", id: 208079219, url: "https://github.com/apps/amazon-q-developer" },
  { key: "factory-droid", label: "Factory Droid", vendor: "Factory", query: "author:app/factory-droid", tier: "bot-account", id: 138933559, url: "https://github.com/apps/factory-droid" },
  { key: "greptile", label: "Greptile", vendor: "Greptile", query: "author:app/greptile-apps", tier: "bot-account", id: 165735046, url: "https://github.com/apps/greptile-apps" },
  { key: "kiro", label: "Kiro", vendor: "Amazon", query: "author:app/kiro-agent", tier: "bot-account", id: 245459735, url: "https://github.com/apps/kiro-agent" },
  { key: "openhands", label: "OpenHands", vendor: "All Hands AI", query: "author:openhands-agent", tier: "bot-account", id: 175740463, url: "https://github.com/openhands-agent" },
  { key: "codex-branch", label: "Codex (codex/ branches)", vendor: "OpenAI", query: "head:codex/", tier: "branch-prefix", note: "PRs whose head branch starts with codex/. Branch naming is a heuristic and does not prove tool use." },
  { key: "claude-branch", label: "Claude (claude/ branches)", vendor: "Anthropic", query: "head:claude/", tier: "branch-prefix", note: "Medium confidence: short prefix, some human branches collide." },
  { key: "cursor-branch", label: "Cursor (cursor/ branches)", vendor: "Anysphere", query: "head:cursor/", tier: "branch-prefix", note: "Medium confidence." },
];

const BY_KEY = new Map(GITHUB_AGENTS.map((a) => [a.key, a]));

export function githubAgent(key: string): GithubAgent | undefined {
  return BY_KEY.get(key);
}

export function githubAgentLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}
