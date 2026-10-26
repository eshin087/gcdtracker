# Local QA

The QA tools use PostgreSQL on loopback and the same Neon HTTP client and Drizzle driver as production. They never use the production connection for test setup. `QA_DATABASE_URL` must explicitly name a `gcdtracker_qa*` database on `localhost`, `127.0.0.1`, or IPv6 loopback; URL parameters are rejected.

The original schema fixture is pinned to the pre-hardening revision recorded in `tests/fixtures/schema-before.sql`. Initialization applies that fixture followed by `drizzle/0001_collector_integrity.sql` and `drizzle/0002_social_samples.sql`. This checks the actual upgrade path rather than creating a different test schema.

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

Browser evidence is written beneath `.qa/`. The site runs locally; QA requests do not affect production observations. Do not assign production secrets to these shells. The QA bridge is a development utility and must not be hosted publicly.

## Scope and historical results

The [September 7 audit](qa-audit.md) records checks and homepage measurements for that revision. The homepage now retains the animation, multi-year lines and heatmap; use `tests/browser/dashboard.spec.ts` alongside the site suite when those features change. Re-measure the same seeded data on both revisions for performance claims instead of quoting the older compact-homepage result.

For an offline application build, explicitly clear `DATABASE_URL` and `PREVIEW_DATABASE_URL` in the command environment, even when ignored local environment files exist. Keep the seeded QA build separate as described above. Test results must identify what actually ran; local bridge checks are not Neon-hosted concurrency verification.

Documentation-only changes require valid Markdown/skill references, accurate code/command paths and a review for private data. They do not require a production deployment or a full application test run.

## Repository automation

GitHub Actions is disabled and no workflow files are included. Run the checks above locally before committing changes. Browser evidence remains beneath the ignored `.qa/` directory and is never uploaded by this repository.

These tests validate the application against deterministic local data. They do not replace a Vercel preview smoke test or establish that a production collector's upstream source is currently healthy.

## Reading and social sample regressions

The setup now applies both 0001 and 0002. An existing isolated QA database can run `npx tsx scripts/qa-database.ts migrate`; `init` still refuses a nonempty database. Use only the named loopback QA database. Stop the local Docker container after tests if it is no longer needed.

Unit coverage includes disclosure false positives, malformed/oversized upstream input, byte/time/record limits, missing observations, UTC windows and public nested-field allowlists. Integration cases exercise once-per-day concurrent reservations, atomic summaries/checkpoints and rollback. Browser coverage in `tests/browser/social.spec.ts` exercises the three activity modes, selected-view mounting, the preserved GitHub heatmap, explicit synthetic demo, line gaps, privacy, keyboard tab navigation, destination-filter reset, pause/reduced motion and light/dark layouts at 390, 768, 1024 and 1440 pixels. Live upstream checks are separate, bounded read-only samples; never seed their raw evidence into fixtures.
