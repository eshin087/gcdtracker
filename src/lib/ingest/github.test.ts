import { describe, expect, it } from "vitest";
import { validateSearchResponse } from "./github";
describe("GitHub search completeness", () => {
  it("accepts a genuine complete zero", () => {
    expect(() => validateSearchResponse({ total_count: 0, incomplete_results: false, items: [] })).not.toThrow();
  });
  it.each([
    { total_count: 0, incomplete_results: true, items: [] },
    { incomplete_results: false, items: [] },
    { total_count: -1, incomplete_results: false, items: [] },
    { total_count: 3, incomplete_results: false },
    { total_count: 0, items: [] },
  ])("rejects malformed/partial responses before persistence", (body) => {
    expect(() => validateSearchResponse(body)).toThrow(/incomplete or malformed/);
  });
});
