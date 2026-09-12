import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { requireQaDatabaseUrl } from "../tests/support/neon-local";

const BEFORE = path.resolve("tests/fixtures/schema-before.sql");
const MIGRATION = path.resolve("drizzle/0001_collector_integrity.sql");
const MIGRATION_DATABASE = "gcdtracker_qa_migration";

async function applyBaseline(pool: Pool) {
  const existing = await pool.query("select count(*)::int as count from information_schema.tables where table_schema='public'");
  if (existing.rows[0].count !== 0) throw new Error("QA init requires an empty database; existing tables were not changed.");
  await pool.query(await readFile(BEFORE, "utf8"));
}
async function applyMigration(pool: Pool) {
  await pool.query(await readFile(MIGRATION, "utf8"));
  await pool.query(await readFile(path.resolve("drizzle/0002_social_samples.sql"), "utf8"));
}

async function dataSnapshot(client: Pool) {
  const tables = await client.query("select table_name from information_schema.tables where table_schema='public' order by table_name");
  const data: Record<string, unknown> = {};
  for (const { table_name: table } of tables.rows as Array<{ table_name: string }>) {
    const identifier = '"' + table.replace(/"/g, '""') + '"';
    data[table] = (await client.query("select to_jsonb(t) as row from public." + identifier + " t order by to_jsonb(t)::text")).rows;
  }
  return data;
}
async function schemaSnapshot(client: Pool) {
  return (await client.query(
    "select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
  )).rows;
}

async function migrationCheck(baseUrl: string) {
  const admin = new Pool({ connectionString: baseUrl, max: 1 });
  let pool: Pool | undefined;
  try {
    const exists = await admin.query("select 1 from pg_database where datname=$1", [MIGRATION_DATABASE]);
    // The identifier is a fixed QA-only literal; no environment value becomes SQL syntax.
    if (!exists.rowCount) await admin.query('create database "gcdtracker_qa_migration"');
    const migrationUrl = new URL(baseUrl);
    migrationUrl.pathname = "/" + MIGRATION_DATABASE;
    pool = new Pool({ connectionString: requireQaDatabaseUrl(migrationUrl.toString()), max: 1 });
    const actual = (await pool.query("select current_database() as name")).rows[0].name;
    if (actual !== MIGRATION_DATABASE) throw new Error("Refusing to reset a database other than gcdtracker_qa_migration.");
    // This explicit test command resets only its separate disposable migration fixture.
    await pool.query("drop schema public cascade; create schema public");
    await applyBaseline(pool);
    await pool.query(`
      insert into osm_changesets (id,ts,"user",editor,ai_kind,changes,comment,url)
      values (9000000001,'2025-01-01T00:00:00Z','legacy-user','Rapid','rapid',7,'legacy evidence','https://example.test/1');
      insert into osm_daily (day,sampled,ai_assisted,by_editor)
      values ('2025-01-01',100,7,'{"Rapid":7}');
      insert into mcp_servers (name,title,description,url,published_at,updated_at)
      values ('qa/legacy','Legacy title','Legacy description','https://example.test/mcp','2025-01-01','2025-01-02');
      insert into gh_archive_hourly (hour,kind,key,value) values ('2025-01-01T00','total','events',123);
      insert into gh_archive_daily (day,kind,key,value,hours) values ('2025-01-01','total','events',123,1);
      insert into visits (day,path,method,ua,category,ip_prefix)
      values ('2025-01-01','/','GET','QA legacy','other-bot','192.0.2.0/24');
    `);
    const before = await dataSnapshot(pool);
    await applyMigration(pool);
    const changeset = (await pool.query("select * from osm_changesets where id=9000000001")).rows[0];
    assert.equal(changeset.collection_version, 1);
    assert.equal(changeset.comment, "legacy evidence");
    assert.equal(changeset.changes, 7);
    const daily = (await pool.query("select * from osm_daily where day='2025-01-01'")).rows[0];
    assert.equal(daily.collection_version, 1);
    assert.equal(daily.sampled, 100);
    assert.deepEqual(daily.by_editor, { Rapid: 7 });
    const mcp = (await pool.query("select * from mcp_servers where name='qa/legacy'")).rows[0];
    assert.equal(mcp.sync_version, 1);
    assert.equal(mcp.status, "unknown");
    assert.equal(mcp.title, "Legacy title");
    assert.equal((await pool.query("select count(*)::int as count from gh_archive_completed")).rows[0].count, 0);
    const after = await dataSnapshot(pool);
    for (const [table, rows] of Object.entries(before)) {
      if (["osm_changesets", "osm_daily", "mcp_servers"].includes(table)) {
        const added = table === "mcp_servers" ? ["status", "sync_version"] : ["collection_version"];
        const stripped = (after[table] as Array<{ row: Record<string, unknown> }>).map(({ row }) => ({
          row: Object.fromEntries(Object.entries(row).filter(([key]) => !added.includes(key))),
        }));
        assert.deepEqual(stripped, rows, table + " legacy values must survive");
      } else assert.deepEqual(after[table], rows, table + " must remain unchanged");
    }
    await pool.query(`
      insert into osm_daily (day,sampled,ai_assisted,by_editor,collection_version)
      values ('2025-01-01',12,2,'{"Rapid":2}',2);
      insert into collector_state (key,state,revision) values ('qa:migration','{"version":2}',3);
      insert into gh_archive_completed (hour,ingest_version) values ('2025-01-01T00',2);
      insert into osm_sample_seen (id,created_at,closed_at,day,ai_kind,editor)
      values (9000000002,'2025-01-01','2025-01-01','2025-01-01','rapid','Rapid');
      insert into mcp_servers (name,status,sync_version) values ('qa/current','active',2);
    `);
    const dataOnce = await dataSnapshot(pool);
    const schemaOnce = await schemaSnapshot(pool);
    await applyMigration(pool);
    assert.deepEqual(await dataSnapshot(pool), dataOnce, "reapplying migration must preserve all legacy and version-2 data");
    assert.deepEqual(await schemaSnapshot(pool), schemaOnce, "reapplying migration must preserve the schema");
    assert.equal((await pool.query("select count(*)::int as count from osm_daily where day='2025-01-01'")).rows[0].count, 2);
    console.log("Migration preservation and reapply checks passed in gcdtracker_qa_migration.");
  } finally {
    await pool?.end();
    await admin.end();
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["init", "migrate", "migration-check"].includes(mode)) throw new Error("Usage: tsx scripts/qa-database.ts init|migrate|migration-check");
  const url = requireQaDatabaseUrl();
  if (mode === "migration-check") return migrationCheck(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    if (mode === "init") await applyBaseline(pool);
    await applyMigration(pool);
    console.log("Initialized isolated QA schema from the original schema plus additive migration.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "QA database setup failed");
  process.exitCode = 1;
});
