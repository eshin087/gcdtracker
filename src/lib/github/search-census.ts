import { GITHUB_AGENTS } from "./agents";

/**
 * GitHub search census, version 1: a deduplicated daily count of public PRs matched by the
 * tracked agent detectors, with all public PRs opened that day as the denominator.
 *
 * Bot-account detectors cannot overlap each other (a PR has one author) and branch-prefix
 * detectors cannot overlap each other (a PR has one head branch). The only cross-group
 * overlaps are agent apps that open branches under a tracked prefix; those are counted
 * directly and subtracted. This is a different detector from the GH Archive census and is
 * never spliced into that history.
 */
export const SEARCH_CENSUS_VERSION = 1;
export const SEARCH_CENSUS_SOURCE = "github-search";
export const SEARCH_TOTAL_SERIES = "prs-opened";

export interface SearchReference { series: string; query: string; label: string }

/** Reference counts collected per finalized UTC day alongside the detector counts. */
export const SEARCH_REFERENCES: SearchReference[] = [
  { series: SEARCH_TOTAL_SERIES, query: "", label: "All public PRs opened" },
  { series: "overlap:claude", query: "head:claude/ author:app/claude", label: "Claude app PRs on claude/ branches" },
  { series: "overlap:cursor", query: "head:cursor/ author:app/cursor", label: "Cursor app PRs on cursor/ branches" },
  { series: "overlap:codex", query: "head:codex/ author:app/chatgpt-codex-connector", label: "Codex connector PRs on codex/ branches" },
];

export const SEARCH_DETECTOR_KEYS = GITHUB_AGENTS.map((a) => a.key);

export interface SearchDetectorRow { day: string; agent: string; prs: number; final: boolean }
export interface SearchReferenceRow { period: string; series: string; value: number }

export interface SearchDay {
  day: string;
  /** Deduplicated agent PR matches; null when the day is not comparable. */
  agentPrs: number | null;
  prsOpened: number | null;
  share: number | null;
  partial: boolean;
  detectorsFinal: number;
  referencesPresent: number;
}

/** Folds stored counts into per-day values. A day is comparable only with every detector final and every reference present. */
export function foldSearchDays(days: string[], detectors: SearchDetectorRow[], references: SearchReferenceRow[]): SearchDay[] {
  const keys = new Set(SEARCH_DETECTOR_KEYS);
  const refSeries = new Set(SEARCH_REFERENCES.map((r) => r.series));
  const byDay = new Map<string, { sum: number; final: Set<string>; refs: Map<string, number> }>();
  const slot = (day: string) => {
    let entry = byDay.get(day);
    if (!entry) byDay.set(day, entry = { sum: 0, final: new Set(), refs: new Map() });
    return entry;
  };
  for (const row of detectors) {
    if (!keys.has(row.agent) || !Number.isFinite(row.prs) || row.prs < 0) continue;
    const entry = slot(row.day);
    if (row.final) { entry.final.add(row.agent); entry.sum += row.prs; }
  }
  for (const row of references) {
    if (!refSeries.has(row.series) || !Number.isFinite(row.value) || row.value < 0) continue;
    slot(row.period.slice(0, 10)).refs.set(row.series, row.value);
  }
  return days.map((day) => {
    const entry = byDay.get(day);
    const detectorsFinal = entry?.final.size ?? 0, referencesPresent = entry?.refs.size ?? 0;
    const complete = !!entry && detectorsFinal === keys.size && referencesPresent === refSeries.size;
    if (!complete) return { day, agentPrs: null, prsOpened: null, share: null, partial: !!entry, detectorsFinal, referencesPresent };
    const overlap = SEARCH_REFERENCES.filter((r) => r.series !== SEARCH_TOTAL_SERIES).reduce((sum, r) => sum + entry.refs.get(r.series)!, 0);
    const agentPrs = entry.sum - overlap, prsOpened = entry.refs.get(SEARCH_TOTAL_SERIES)!;
    // Search counts are taken at slightly different moments; an impossible union is not comparable.
    if (agentPrs < 0 || prsOpened <= 0 || agentPrs > prsOpened) return { day, agentPrs: null, prsOpened: null, share: null, partial: true, detectorsFinal, referencesPresent };
    return { day, agentPrs, prsOpened, share: agentPrs / prsOpened, partial: false, detectorsFinal, referencesPresent };
  });
}

/** Comparable days in the half-open window [start, end). */
export function searchWindow(days: SearchDay[], start: string, end: string): { agentPrs: number; prsOpened: number; days: number } {
  const inside = days.filter((d) => !d.partial && d.agentPrs !== null && d.day >= start && d.day < end);
  return { agentPrs: inside.reduce((s, d) => s + d.agentPrs!, 0), prsOpened: inside.reduce((s, d) => s + d.prsOpened!, 0), days: inside.length };
}
