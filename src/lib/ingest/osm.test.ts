import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";
import { commitOsmSamples, osmPageStatements, osmSample, type Changeset } from "./osm";

const from = new Date("2026-09-05T12:00:00Z"), to = new Date("2026-09-07T12:00:00Z");
const changeset: Changeset = { id: 42, created_at: "2026-09-06T11:00:00Z", closed_at: "2026-09-07T10:00:00Z", open: false, tags: { created_by: "Rapid 2.0" } };
describe("OSM bounded samples", () => {
  it("buckets by closure while restricting creation to the declared sample window", () => {
    expect(osmSample(changeset, from, to)).toMatchObject({ day: "2026-09-07", ai_kind: "rapid" });
    expect(osmSample({ ...changeset, created_at: "2026-09-01T10:00:00Z" }, from, to)).toBeNull();
    expect(osmSample({ ...changeset, created_at: to.toISOString() }, from, to)).toBeNull();
    expect(osmSample({ ...changeset, closed_at: "2026-09-08T00:00:00Z" }, from, to)).toBeNull();
  });
  it("keeps non-AI samples for denominator deduplication", () => {
    expect(osmSample({ ...changeset, tags: {} }, from, to)).toMatchObject({ id: 42, ai_kind: null, editor: null });
  });
  it("does not write malformed observations", () => {
    expect(() => osmSample({ ...changeset, id: NaN }, from, to)).toThrow();
    expect(() => osmSample({ ...changeset, closed_at: "invalid" }, from, to)).toThrow();
  });
  it("submits deduplication, details, and a versioned recomputation in one batch", async () => {
    const sample = osmSample(changeset, from, to)!;
    const dialect = new PgDialect();
    const batch = vi.fn().mockResolvedValue([{}, { rows: [{ id: 42, ai_kind: "rapid" }] }, {}, {}]);
    const db = { execute: (query: Parameters<PgDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(query), batch } as unknown as Db;
    expect(await commitOsmSamples(db, [sample, sample])).toEqual({ inserted: 1, ai: 1 });
    const queries = batch.mock.calls[0][0];
    expect(queries).toHaveLength(4);
    expect(queries[0].sql).toContain("pg_advisory_xact_lock");
    expect(JSON.parse(queries[1].params[0])).toHaveLength(1);
    expect(queries[1].sql).toContain("on conflict (id) do nothing");
    expect(queries[3].sql).toContain("on conflict (day, collection_version)");
    expect(queries[3].sql).not.toContain("+ excluded");
  });
  it("locks days in stable order for overlapping runs", () => {
    const sample = osmSample(changeset, from, to)!;
    const statements = osmPageStatements([sample, { ...sample, id: 43, day: "2026-09-06" }]);
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(statements[0]).params).toContain("2026-09-06");
    expect(dialect.sqlToQuery(statements[1]).params).toContain("2026-09-07");
  });
});
