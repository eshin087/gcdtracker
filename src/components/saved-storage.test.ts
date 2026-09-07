import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalSavedId, normalizeSaved, readSaved, SAVED_KEY, subscribeSaved, writeSaved } from "./saved-storage";

const row = { id: "map-1", title: "Evidence", kind: "map", url: "https://example.com/record", savedAt: "2026-09-07T12:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
describe("saved evidence", () => {
  it("recovers valid entries from malformed data and rejects unsafe links", () => {
    expect(normalizeSaved([null, {}, { ...row, savedAt: "bad" }, { ...row, url: "javascript:alert(1)" }, { ...row, url: "//evil.test" }, row])).toEqual([row]);
    expect(normalizeSaved("not an array")).toEqual([]);
  });
  it("migrates old map IDs and deduplicates across source pages", () => {
    expect(canonicalSavedId("osm-1")).toBe("map-1");
    expect(normalizeSaved([{ ...row, id: "osm-1" }, row])).toEqual([row]);
  });
  it("handles invalid JSON and unavailable storage", () => {
    vi.stubGlobal("localStorage", { getItem: () => "[" });
    expect(readSaved()).toEqual([]);
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("disabled"); } });
    expect(readSaved()).toEqual([]);
  });
  it("updates same-tab and other-tab subscribers and cleans them up", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    vi.stubGlobal("localStorage", { setItem: vi.fn() });
    const listener = vi.fn();
    const unsubscribe = subscribeSaved(listener);
    writeSaved([row]);
    const storage = Object.assign(new Event("storage"), { key: SAVED_KEY });
    target.dispatchEvent(storage);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe(); target.dispatchEvent(storage);
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it("limits stored records", () => {
    expect(normalizeSaved(Array.from({ length: 510 }, (_, i) => ({ ...row, id: "map-" + i })))).toHaveLength(500);
  });
});
