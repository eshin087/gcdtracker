import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./observatory";

const sample = {
  schemaVersion: 1,
  generatedAt: "2026-08-01T12:54:11.710Z",
  agents: [
    {
      id: "copilot",
      name: "GitHub Copilot",
      operator: "GitHub",
      kind: "coding",
      platform: "github",
      identity: { login: "Copilot", id: 198982749, appSlug: "copilot-swe-agent" },
      website: "https://github.com/features/copilot",
      lastActivityAt: "2026-09-06T04:01:50Z",
    },
  ],
  activities: [
    {
      id: "github-pr-5362745422",
      sourceId: "github-gh-aw",
      platform: "github",
      kind: "pull_request",
      title: "Register replace_label handler in safe-output collect job dispatch map",
      url: "https://github.com/github/gh-aw/pull/58917",
      actor: { id: 198982749, login: "Copilot" },
      agentId: "copilot",
      attribution: "documented_agent",
      createdAt: "2026-09-06T04:01:50Z",
      sourceUpdatedAt: "2026-09-06T12:38:59Z",
      lastObservedAt: "2026-09-06T12:54:11.710Z",
      repository: "github/gh-aw",
      state: "open",
    },
    { id: "broken", title: "no url" },
  ],
  candidates: [
    {
      id: "github-pr-5089966805-generated-by",
      activityId: "github-pr-5089966805",
      ruleId: "generated-by",
      excerpt: "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
      status: "unreviewed",
      evidenceUrls: ["https://github.com/airbytehq/airbyte/pull/83777"],
    },
  ],
  sources: [{ id: "github-gh-aw" }],
};

describe("parseSnapshot", () => {
  it("converts records to rows and skips broken ones", () => {
    const r = parseSnapshot(sample);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]).toMatchObject({ id: "github-pr-5362745422", agentId: "copilot", actorId: 198982749, repository: "github/gh-aw", state: "open" });
    expect(r.activities[0].createdAt.toISOString()).toBe("2026-09-06T04:01:50.000Z");
    expect(r.candidates[0]).toMatchObject({ ruleId: "generated-by", url: "https://github.com/airbytehq/airbyte/pull/83777" });
    expect(r.agents[0]).toMatchObject({ id: "copilot", login: "Copilot", identityId: 198982749, historical: false });
    expect(r.sources).toBe(1);
    expect(r.stale).toBe(true); // fixture is dated
  });

  it("rejects other schema versions", () => {
    expect(() => parseSnapshot({ ...sample, schemaVersion: 2 })).toThrow();
  });
});
