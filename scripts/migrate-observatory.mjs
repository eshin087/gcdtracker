// One-off: rename the phase-2 observatory_* tables to watched_* so the native
// collector keeps the rows. Safe to re-run; skips when already migrated.
// Usage: node scripts/migrate-observatory.mjs   (reads DATABASE_URL from .env.local)
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
const sql = neon(process.env.DATABASE_URL);

const exists = async (name) =>
  (await sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${name}`).length > 0;

if ((await exists("observatory_activities")) && !(await exists("watched_prs"))) {
  await sql`alter table observatory_activities rename to watched_prs`;
  console.log("renamed observatory_activities -> watched_prs");
}
if ((await exists("observatory_candidates")) && !(await exists("watched_signals"))) {
  await sql`alter table observatory_candidates rename to watched_signals`;
  console.log("renamed observatory_candidates -> watched_signals");
}
if (await exists("observatory_agents")) {
  await sql`drop table observatory_agents`;
  console.log("dropped observatory_agents");
}
// old index names are harmless; drizzle-kit push reconciles the rest
const [{ n }] = await sql`select count(*)::int as n from watched_prs`;
console.log(`watched_prs rows: ${n}`);
