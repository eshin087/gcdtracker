import { describe, expect, it } from "vitest";
import { findSignatures, stripQuotedAndFenced } from "./signatures";

describe("findSignatures", () => {
  it("detects the common attribution footers", () => {
    expect(findSignatures("Fixes #12\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)")).toEqual([
      { ruleId: "generated-by", excerpt: "🤖 Generated with [Claude Code](https://claude.com/claude-code)" },
    ]);
    expect(findSignatures("Made with Cursor").map((h) => h.ruleId)).toEqual(["made-with"]);
    expect(findSignatures("Implemented with Codex assistance. Tests added.").map((h) => h.ruleId)).toEqual(["implemented-with"]);
    expect(findSignatures("Co-authored-by: Claude <noreply@anthropic.com>").map((h) => h.ruleId)).toEqual(["ai-coauthor"]);
    expect(findSignatures("aider: fix typo\n\nsome body").map((h) => h.ruleId)).toEqual(["aider"]);
  });

  it("ignores quoted text and code blocks", () => {
    expect(findSignatures("> Generated with Claude Code\nActual change: bump version")).toEqual([]);
    expect(findSignatures("```\nGenerated with Claude Code\n```\nManual fix")).toEqual([]);
  });

  it("does not fire on plain mentions of tools", () => {
    expect(findSignatures("Add Claude API client and Copilot docs link")).toEqual([]);
    expect(findSignatures(null)).toEqual([]);
  });

  it("strips fences and quotes", () => {
    expect(stripQuotedAndFenced("a\n> b\n```\nc\n```\nd")).toBe("a\n \nd");
  });
});
