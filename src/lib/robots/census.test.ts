import { describe, expect, it } from "vitest";
import { namedTool } from "@/lib/github/signatures";
// The worker is plain JS so GitHub Actions can run it without a build; vitest resolves its .ts import.
import { parseRobots } from "../../../scripts/robots-census.mjs";

describe("parseRobots", () => {
  it("merges repeated groups before deciding a full block", () => {
    expect([...parseRobots("User-agent: GPTBot\nDisallow: /\nUser-agent: GPTBot\nAllow: /public").blocked]).toEqual([]);
  });
  it("keeps wildcard directives separate from named-token directives", () => {
    expect([...parseRobots("User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /").blocked]).toEqual(["*"]);
  });
  it("ignores extension fields between user-agent lines", () => {
    expect([...parseRobots("User-agent: GPTBot\nCrawl-delay: 10\nUser-agent: ClaudeBot\nDisallow: /").blocked].sort()).toEqual(["ClaudeBot", "GPTBot"]);
  });
  it("attributes a full block to every agent in the group", () => {
    const { mentioned, blocked } = parseRobots(["User-agent: GPTBot", "User-agent: ClaudeBot", "Disallow: /", "", "User-agent: *", "Disallow: /admin"].join("\n"));
    expect([...mentioned].sort()).toEqual(["*", "ClaudeBot", "GPTBot"]);
    expect([...blocked].sort()).toEqual(["ClaudeBot", "GPTBot"]);
  });

  it("does not count a partial disallow or an allow-listed group as blocked", () => {
    const { blocked } = parseRobots("User-agent: GPTBot\nDisallow: /private\n\nUser-agent: CCBot\nAllow: /public\nDisallow: /");
    expect(blocked.size).toBe(0);
  });

  it("is case-insensitive and ignores comments and versions", () => {
    const { mentioned, blocked } = parseRobots("# block ai\nuser-agent: gptbot/1.0 # openai\ndisallow: /\n");
    expect([...mentioned]).toEqual(["GPTBot"]);
    expect([...blocked]).toEqual(["GPTBot"]);
  });

  it("starts a new group after rules", () => {
    const { blocked } = parseRobots("User-agent: Bytespider\nDisallow: /\nUser-agent: Googlebot\nDisallow: /tmp");
    expect([...blocked]).toEqual(["Bytespider"]);
  });
});

describe("namedTool", () => {
  it("maps signature excerpts to tool keys", () => {
    expect(namedTool("🤖 Generated with [Claude Code](https://claude.com/claude-code)")).toBe("claude");
    expect(namedTool("Co-authored-by: Copilot <copilot@github.com>")).toBe("copilot");
    expect(namedTool("Made with Cursor")).toBe("cursor");
    expect(namedTool("aider: fix typo")).toBe("aider");
    expect(namedTool("Implemented with the OpenAI Codex agent")).toBe("codex");
    expect(namedTool("Co-authored-by: Amazon Q Developer")).toBe("amazon-q");
  });
});
