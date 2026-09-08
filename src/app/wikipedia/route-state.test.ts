import { describe, expect, it } from "vitest";
import { parseWikiRoute } from "./route-state";
describe("Wikipedia routes", () => {
  it("accepts the intended views, tiers and page bounds", () => {
    expect(parseWikiRoute(undefined)?.view).toBe("day");
    expect(parseWikiRoute(["wikimedia"])?.view).toBe("wikimedia");
    expect(parseWikiRoute(["editors"])?.view).toBe("editors");
    expect(parseWikiRoute(["edits", "1", "500"])).toEqual({ view: "edits", tier: "1", page: 500 });
  });
  it.each([["edits", "all", "1", "extra"], ["editors", "extra"], ["wikimedia", "extra"], ["edits", "3"], ["edits", "all", "0"], ["edits", "all", "501"], ["edits", "all", "1e2"], ["edits", "all", "1.0"], ["missing"]])("rejects invalid route segments %j", (...segments) => expect(parseWikiRoute(segments)).toBeNull());
});
