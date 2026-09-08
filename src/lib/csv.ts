function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const isNumber = typeof value === "number" && Number.isFinite(value);
  let text = value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.join("|") : String(value);
  // CSV quoting does not stop formula execution. Guard text, preserving real numbers.
  if (!isNumber && (/^[\t\r\n]/.test(text) || /^[\s\u0000-\u001f]*[=+\-@]/.test(text))) text = "'" + text;
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/** Supply stable columns so empty exports still include their header. */
export function toCsv(rows: Array<Record<string, unknown>>, columns?: readonly string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(cell).join(",")];
  for (const row of rows) lines.push(cols.map((column) => cell(row[column])).join(","));
  return lines.join("\n") + "\n";
}
