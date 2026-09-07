export type Tier = "all" | "1" | "2";
export interface WikiRoute { view: "day" | "edits" | "editors" | "wikimedia"; tier: Tier; page: number; }
export function parseWikiRoute(segments: string[] | undefined): WikiRoute | null {
  if (!segments?.length) return { view: "day", tier: "all", page: 1 };
  const [view, tier = "all", pageText = "1"] = segments;
  if ((view === "editors" || view === "wikimedia") && segments.length === 1) return { view, tier: "all", page: 1 };
  if (view !== "edits" || segments.length > 3 || !["all", "1", "2"].includes(tier) || !/^[1-9]\d*$/.test(pageText)) return null;
  const page = Number(pageText);
  if (!Number.isSafeInteger(page) || page > 500) return null;
  return { view: "edits", tier: tier as Tier, page };
}
