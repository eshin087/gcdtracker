import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import {
  publicVisit, publicGuestbookNote, publicPath, publicAgentIdentity, publicTrapPlacement,
  guestbookJson, visitCsvRow, VISIT_CSV_COLUMNS, visitEvidenceColumns, guestbookEvidenceColumns,
} from "./public-evidence";
import { exportColumns } from "./export-columns";

const privateVisit = {
  id: 1, ts: new Date("2026-09-07T00:00:00Z"), day: "2026-09-07", path: "/private/secret-user-id",
  method: "GET", agentSlug: "signed:private-signature.example", agentName: "private-signature.example",
  operator: "private-signature.example", category: "ai-browsing-agent", verified: null, verifiedBy: null,
  signed: true, signatureAgent: "private-signature.example", ipPrefix: "203.0.113.0/24",
  ipHash: "private-hash", country: "US", referer: "private-referrer.example", ua: "private-header",
  robotsViolation: true, trapToken: "private",
};
const forbidden = ["ipPrefix", "ipHash", "ua", "referer", "signatureAgent", "trapToken"];

describe("public visitor evidence", () => {
  it("removes private fields and legacy signature identity from all outputs", () => {
    const row = publicVisit(privateVisit);
    expect(row).toMatchObject({ agentSlug: null, agentName: null, operator: null, signed: true, signatureStatus: "unverified", path: "/private/[path]", trapPlacement: "private" });
    const serialized = JSON.stringify(row);
    for (const field of forbidden) expect(row).not.toHaveProperty(field);
    for (const value of ["private-signature", "private-header", "private-referrer", "203.0.113", "secret-user-id"]) expect(serialized).not.toContain(value);
    const csv = toCsv([visitCsvRow(row)], VISIT_CSV_COLUMNS);
    expect(csv).not.toMatch(/signature_agent|ip_prefix|ip_hash|referer|trap_token|private-signature|private-header/);
    expect(csv.split("\n")[0]).toBe(VISIT_CSV_COLUMNS.join(","));
  });

  it("uses only catalog metadata and separates presence from verification", () => {
    expect(publicAgentIdentity("gptbot")).toMatchObject({ agentSlug: "gptbot", operator: "OpenAI" });
    const row = publicVisit({ ...privateVisit, agentSlug: "gptbot", verified: true, verifiedBy: "ip-range:openai-gptbot", signed: false, country: "??" });
    expect(row).toMatchObject({ agentName: "GPTBot", operator: "OpenAI", verified: true, signed: false, signatureStatus: "absent", country: null });
  });

  it.each([
    ["/visitors", "/visitors"], ["/robots.txt", "/robots.txt"], ["/visitors?secret=x", "/visitors"],
    ["/trap/random-private-token", "/trap/[token]"], ["/private/secret", "/private/[path]"],
    ["/agents/signed:private.example", "/agents/[slug]"], ["/investigations/private", "/investigations/[slug]"],
    ["/wikipedia/edits/all/2", "/wikipedia/edits"], ["/github/signals/unreviewed", "/github/signals"],
    ["/unrecognized/private-data", "/other"], ["https://private.example", "/other"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(publicPath(input)).toBe(expected);
  });

  it("returns only known trap placements, never supplied tokens", () => {
    expect(publicTrapPlacement("f7k2-hidden-footer-link")).toBe("footer");
    expect(publicTrapPlacement("private-token")).toBe("unknown");
    expect(publicTrapPlacement(null)).toBeNull();
  });

  it("does not select raw headers or network identifiers for public DTOs", () => {
    for (const field of forbidden.filter((field) => field !== "trapToken")) {
      expect(visitEvidenceColumns).not.toHaveProperty(field);
      expect(guestbookEvidenceColumns).not.toHaveProperty(field);
    }
  });
});

describe("guestbook and export contracts", () => {
  it("projects deliberate public note text without leaking internal fields", () => {
    const raw = { ...privateVisit, name: "Visitor", operator: "Public author", purpose: "Research", note: "Hello", hidden: false };
    const row = publicGuestbookNote(raw);
    const json = guestbookJson(row);
    expect(json).toEqual({ id: 1, ts: privateVisit.ts, name: "Visitor", operator: "Public author", purpose: "Research", note: "Hello", agent: null, signed: true, signatureStatus: "unverified" });
    for (const field of [...forbidden, "hidden"]) expect(row).not.toHaveProperty(field);
  });

  it("keeps versioned methodology public and internal state private", () => {
    expect(exportColumns.osmChangesets).toHaveProperty("collectionVersion");
    expect(exportColumns.mcpServers).toHaveProperty("status");
    expect(exportColumns.mcpServers).toHaveProperty("syncVersion");
    expect(Object.keys(exportColumns)).not.toContain("collectorState");
    expect(Object.keys(exportColumns)).not.toContain("osmSampleSeen");
    expect(toCsv([], VISIT_CSV_COLUMNS)).toBe(VISIT_CSV_COLUMNS.join(",") + "\n");
  });
});
