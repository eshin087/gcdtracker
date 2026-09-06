const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 12345 -> "12,345" */
export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return Math.round(n).toLocaleString("en-US");
}

/** 0.042 -> "4.2%" */
export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  return `${(x * 100).toFixed(digits)}%`;
}

/** "2026-09-06" -> "6 Sep" */
export function fmtDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${d} ${MONTHS[m - 1]}`;
}

/** "2026-09-06" -> "6 September 2026" */
export function fmtDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input.length === 10 ? `${input}T00:00:00Z` : input) : input;
  if (Number.isNaN(d.getTime())) return String(input);
  return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** ISO timestamp -> "6 Sep, 08:25 UTC" */
export function fmtStamp(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return String(input);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

/** relative time, e.g. "4m ago" */
export function relTime(input: string | Date | null | undefined, now: Date = new Date()): string {
  if (!input) return "never";
  const d = typeof input === "string" ? new Date(input) : input;
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

/** YYYY-MM-DD in UTC */
export function dayOf(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for `n` days before `d` (UTC) */
export function daysAgo(n: number, d: Date = new Date()): string {
  return dayOf(new Date(d.getTime() - n * 86_400_000));
}

/** "2026-09-06" -> "20260906" (Wikimedia metrics format) */
export function compactDay(day: string): string {
  return day.replace(/-/g, "");
}

/** list of YYYY-MM-DD from start to end inclusive */
export function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cur <= stop) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function truncate(s: string | null | undefined, max: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
