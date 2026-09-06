import { describe, expect, it } from "vitest";
import { buildLists, ipInList, verifyIp } from "./verify";

describe("CIDR verification", () => {
  const lists = buildLists([
    { source: "openai-gptbot", cidr: "132.196.86.0/24" },
    { source: "openai-gptbot", cidr: "20.125.66.80/28" },
    { source: "google-agents", cidr: "2001:4860:c::/124" },
    { source: "broken", cidr: "not/a/cidr" },
    { source: "broken", cidr: "1.2.3.4/99" },
  ]);

  it("matches IPv4 inside and outside ranges", () => {
    const l = lists.get("openai-gptbot")!;
    expect(ipInList(l, "132.196.86.200")).toBe(true);
    expect(ipInList(l, "20.125.66.95")).toBe(true);
    expect(ipInList(l, "20.125.66.96")).toBe(false);
    expect(ipInList(l, "8.8.8.8")).toBe(false);
  });

  it("matches IPv6 ranges", () => {
    const l = lists.get("google-agents")!;
    expect(ipInList(l, "2001:4860:c::a")).toBe(true);
    expect(ipInList(l, "2001:4860:c::10")).toBe(false);
  });

  it("skips malformed rows", () => {
    expect(lists.has("broken")).toBe(false);
  });

  it("returns null when nothing can verify (no database in tests)", async () => {
    expect(await verifyIp("1.2.3.4", "openai-gptbot")).toEqual({ verified: null, by: null });
    expect(await verifyIp(null, "openai-gptbot")).toEqual({ verified: null, by: null });
  });
});
