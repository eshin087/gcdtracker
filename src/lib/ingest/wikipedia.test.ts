import { describe, expect, it } from "vitest";
import { type RecentChange, scoreEdit } from "./wikipedia";

const base: RecentChange = {
  type: "edit",
  ns: 0,
  title: "Demographics of Liechtenstein",
  revid: 1,
  rcid: 1,
  user: "Someone",
  timestamp: "2026-09-06T08:21:30Z",
  comment: "Added 2010 numbers",
  tags: [],
};

describe("scoreEdit", () => {
  it("puts first-party tags in tier 1", () => {
    const s = scoreEdit({ ...base, tags: ["visualeditor", "possible AI-generated citations"] });
    expect(s).toEqual({ tier: 1, signals: ["tag:possible AI-generated citations"] });
  });

  it("flags self-referential summaries as tier 2", () => {
    expect(scoreEdit({ ...base, comment: "Expanded the lead, generated with ChatGPT and reviewed" })?.tier).toBe(2);
    expect(scoreEdit({ ...base, comment: "copyedit with Claude" })?.signals).toContain("summary:claude");
  });

  it("does not flag edits to articles about AI tools", () => {
    expect(scoreEdit({ ...base, title: "ChatGPT", comment: "Updated ChatGPT release history" })).toBeNull();
  });

  it("flags agent-like usernames without a bot flag, but ignores flagged bots", () => {
    expect(scoreEdit({ ...base, user: "ResearchAgent42" })?.signals).toContain("user:agent-like");
    expect(scoreEdit({ ...base, user: "ClueBot NG", bot: true, comment: "Reverting (BOT)" })).toBeNull();
  });

  it("returns null for ordinary edits", () => {
    expect(scoreEdit(base)).toBeNull();
  });
});
