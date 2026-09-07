# Local and continuous QA

The QA tools use PostgreSQL on loopback and the same Neon HTTP client and Drizzle driver as production. They never use the production connection for test setup. `QA_DATABASE_URL` must explicitly name a `gcdtracker_qa*` database on `localhost`, `127.0.0.1`, or IPv6 loopback; URL parameters are rejected.

The original schema fixture is pinned to the pre-hardening revision recorded in `tests/fixtures/schema-before.sql`. Initialization applies that fixture followed by `drizzle/0001_collector_integrity.sql`. This checks the actual upgrade path rather than creating a different test schema.

## Run locally

Start a disposable PostgreSQL 16 instance. Example:

```sh
docker run --name gcdtracker-qa-postgres -e POSTGRES_USER=qa -e POSTGRES_PASSWORD=qa-local-only -e POSTGRES_DB=gcdtracker_qa -p 127.0.0.1:55432:5432 -d postgres:16
```

Set these variables in the shell running the commands (PowerShell uses `$env:NAME='value'`):

```sh
export QA_DATABASE_URL='postgresql://qa:qa-local-only@127.0.0.1:55432/gcdtracker_qa'
export DATABASE_URL=''
export PREVIEW_DATABASE_URL=''
npx tsx scripts/qa-database.ts init
npx tsx scripts/qa-database.ts migration-check
npm test
npm run test:integration
```

`init` refuses an existing nonempty database. `migration-check` creates or resets only the separate local database `gcdtracker_qa_migration`. It inserts historical observations, verifies their preservation and legacy version labels, creates version-2 records alongside them, reapplies the migration, and compares all stored rows and column definitions. It does not reset the main QA database.

Integration tests use real transactions through `tests/support/neon-local.ts`. The adapter receives the Neon HTTP request format, executes each batch on one PostgreSQL connection, returns raw text values with PostgreSQL field metadata, and lets Neon and Drizzle decode the response. Tests cover simultaneous guestbook quotas, the snapshot after a blocked advisory lock, rollback, replay, collector checkpoints, historical methodology versions and public-data privacy.

The test files clear their own QA tables. Run them before seeding browser fixtures, and do not run them concurrently with browser QA.

## Seeded browser QA

```sh
npx tsx scripts/qa-seed.ts
npx playwright install chromium
npx tsx scripts/qa-proxy.ts
```

The seed command deliberately replaces fixture data only in the explicitly configured QA database. Leave the proxy running; its default endpoint is `http://127.0.0.1:55433/sql`. In a second shell, configure the local application:

```sh
export DATABASE_URL="$QA_DATABASE_URL"
export GCD_QA_MODE=1
export QA_NEON_HTTP_ENDPOINT='http://127.0.0.1:55433/sql'
export IP_HASH_SECRET='qa-only-secret'
npm run build
npm start -- --hostname 127.0.0.1 --port 3100
```

Use a fresh `.next` build when switching from an offline build to seeded QA so cached offline output cannot carry over. In another shell:

```sh
export QA_SITE_URL='http://127.0.0.1:3100'
npm run test:browser
```

Browser evidence is written beneath `.qa/`. The site runs locally; QA requests do not affect the public sensor. Do not assign production secrets to these shells. The QA bridge is a development utility and must not be hosted publicly.

## CI

`.github/workflows/qa.yml` runs on pull requests, pushes to `main`, and manual dispatch. It installs from the lockfile, audits dependencies, lints, typechecks, runs unit tests, and verifies an offline production build. A disposable PostgreSQL service then runs schema initialization, preservation/reapply checks and the integration suite.

CI seeds deterministic fixtures, starts the local Neon bridge, performs a clean seeded production build, and runs Chromium browser tests against the local site. Logs, traces and reports are retained as QA artifacts for seven days. The workflow has read-only repository permissions and receives no deployment or production database secrets.

These tests validate the application against deterministic local data. They do not replace a Vercel preview smoke test or establish that a production collector's upstream source is currently healthy.
