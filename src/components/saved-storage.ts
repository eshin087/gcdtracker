export interface SavedItem {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  sub?: string;
  savedAt: string;
}
export const SAVED_KEY = "gcd:saved";
export const SAVED_EVENT = "gcd:saved-changed";
export const canonicalSavedId = (id: string) => id.startsWith("osm-") ? "map-" + id.slice(4) : id;

function safeUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  if (/^\/(?![\/\\])/.test(value) && !/[\\\r\n]/.test(value)) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}

/** Treat saved browser data as untrusted; retain valid entries and migrate old map IDs. */
export function normalizeSaved(value: unknown): SavedItem[] {
  if (!Array.isArray(value)) return [];
  const items: SavedItem[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || row.id.length > 256 || typeof row.kind !== "string" || typeof row.title !== "string" || typeof row.savedAt !== "string" || !Number.isFinite(Date.parse(row.savedAt)) || !safeUrl(row.url)) continue;
    const id = canonicalSavedId(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, kind: row.kind.slice(0, 80), title: row.title.slice(0, 2000), url: row.url, savedAt: row.savedAt, ...(typeof row.sub === "string" ? { sub: row.sub.slice(0, 2000) } : {}) });
    if (items.length === 500) break;
  }
  return items;
}

let cachedRaw: string | null | undefined;
let cachedItems: SavedItem[] = [];
export function readSaved(): SavedItem[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (raw === cachedRaw) return cachedItems;
    const items = raw && raw.length <= 4_000_000 ? normalizeSaved(JSON.parse(raw)) : [];
    cachedRaw = raw;
    cachedItems = items;
    return items;
  } catch { return []; }
}
export function writeSaved(items: SavedItem[]): void {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(normalizeSaved(items))); window.dispatchEvent(new Event(SAVED_EVENT)); } catch { /* Storage can be disabled or full. */ }
}
export function subscribeSaved(sync: () => void): () => void {
  const storage = (event: StorageEvent) => { if (event.key === SAVED_KEY || event.key === null) sync(); };
  window.addEventListener(SAVED_EVENT, sync);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(SAVED_EVENT, sync); window.removeEventListener("storage", storage); };
}
