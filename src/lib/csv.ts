function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV using the keys of the first row (or the given columns). */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(","));
  return `${lines.join("\n")}\n`;
}
