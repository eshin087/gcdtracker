/** UTC calendar dates only; reject rollover dates such as February 30. */
export function isUtcDay(day: unknown): boolean {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
/** Half-open UTC date windows [start,end); missing observations never stretch a week. */
export function calendarWindow<T>(rows: T[], period: (row: T) => string, start: string, end: string): T[] {
  if (!isUtcDay(start) || !isUtcDay(end) || start > end) throw new Error("invalid calendar window");
  return rows.filter((row) => isUtcDay(period(row)) && period(row) >= start && period(row) < end);
}
export function dateBefore(day: string, days: number): string {
  if (!isUtcDay(day) || !Number.isInteger(days)) throw new Error("invalid UTC day or offset");
  return new Date(Date.parse(day + "T00:00:00Z") - days * 86_400_000).toISOString().slice(0, 10);
}
