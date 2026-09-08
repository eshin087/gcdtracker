import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { ARCHIVE_TOTAL_KEYS, archiveReplacementStatements, hoursBetween, parseArchivePayload, validArchiveHour, type HourRecord } from "./gharchive";

const hour = (): HourRecord => ({ hour: "2026-09-07T01", rows: ARCHIVE_TOTAL_KEYS.map((key) => ({ kind: "total", key, value: 0 })) });
const payload = (hours: HourRecord[]) => JSON.stringify({ ingestVersion: 2, hours });
describe("GH Archive transactional inputs", () => {
  it("accepts an observed zero hour and retains its completion semantics", () => {
    expect(parseArchivePayload(payload([hour()]))).toHaveLength(1);
  });
  it("requires all counters and rejects duplicate hours/metrics", () => {
    const incomplete = hour(); incomplete.rows.pop();
    expect(() => parseArchivePayload(payload([incomplete]))).toThrow("required totals");
    expect(() => parseArchivePayload(payload([hour(), hour()]))).toThrow("repeated");
    const repeated = hour(); repeated.rows.push(repeated.rows[0]);
    expect(() => parseArchivePayload(payload([repeated]))).toThrow("duplicate");
  });
  it("rejects legacy payloads, invalid dates, negatives, and impossible shares", () => {
    expect(() => parseArchivePayload(JSON.stringify({ hours: [hour()] }))).toThrow("ingestVersion");
    expect(validArchiveHour("2026-02-30T00")).toBe(false);
    expect(validArchiveHour("2026-09-07T24")).toBe(false);
    const negative = hour(); negative.rows[0].value = -1;
    expect(() => parseArchivePayload(payload([negative]))).toThrow("count");
    const inconsistent = hour(); inconsistent.rows.push({ kind: "agent-prs", key: "claude", value: 1 });
    expect(() => parseArchivePayload(payload([inconsistent]))).toThrow("inconsistent");
  });
  it("bounds ranges before allocating missing-hour arrays", () => {
    expect(hoursBetween("2026-09-07T00", "2026-09-07T02")).toHaveLength(3);
    expect(() => hoursBetween("2026-09-07T01", "2026-09-07T00")).toThrow();
    expect(() => hoursBetween("2000-01-01T00", "2026-09-07T00")).toThrow("large");
  });
  it("replaces sparse rows and rollups before recording completion under ordered day locks", () => {
    const second = { ...hour(), hour: "2026-09-06T23" };
    const statements = archiveReplacementStatements([hour(), second]);
    const dialect = new PgDialect();
    const queries = statements.map((s) => dialect.sqlToQuery(s));
    expect(queries[0].params).toContain("2026-09-06");
    expect(queries[1].params).toContain("2026-09-07");
    expect(queries[2].sql).toContain("delete from gh_archive_hourly");
    expect(queries[4].sql).toContain("delete from gh_archive_daily");
    expect(queries.at(-1)?.sql).toContain("insert into gh_archive_completed");
    expect(queries[3].sql).not.toContain("2026-09-07T01");
  });
});
