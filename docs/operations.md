# Migration, rollback and bounded repair

This runbook describes procedures, not the current production deployment or migration state; check [status](status.md) and the actual environment first. The application requires the additive schema migration before data-backed operation. Do not reapply it just because this guide exists. Never use the QA scripts against production; they refuse non-loopback or non-QA database names.

## Preview and production diagnosis

1. Identify the exact URL and environment: local development, synthetic `/demo`, Vercel preview, or production alias. A login page can be deployment protection rather than an application failure.
2. Check the requested PR's state and merge commit in GitHub. Inspect the active Vercel deployment and its source SHA/build result separately; merging a PR does not prove the alias serves it.
3. Check the database environment selection in `src/lib/db/index.ts`: previews use `PREVIEW_DATABASE_URL`, other environments use `DATABASE_URL`. Verify presence and target privately, never by printing values. Previews without their isolated connection remain offline.
4. Inspect `/api/live` and `/data`. Compare `generatedAt`, last run, source outcomes and observation windows; the health response itself can be cached. Routine sources are scheduled daily, and historical worker datasets are unscheduled. See the [remaining health delivery/cache verification](roadmap.md#r1-align-health-with-the-daily-schedule).
5. If still unresolved, inspect deployment logs, applied schema and source-specific progress using narrow read-only checks. A collector can fail, return partial progress, or be deliberately disabled while the database is reachable. Do not prescribe waiting unless checkpoints or observations demonstrably advance.

Reading `/api/ingest/all` or most source-specific ingestion GET routes triggers writes. Use public health/read-only summaries for diagnosis. Only GH Archive and robots-census have explicit read-only GET status branches; inspect their required query parameters before use. Do not test ingestion by sending live payloads without a scoped repair request.

## Release procedure

1. Validate on disposable local PostgreSQL with the synthetic QA fixture, or an isolated Neon branch when that environment is explicitly needed. Run `drizzle/0001_collector_integrity.sql` through the documented upgrade path. The local regression harness checks legacy preservation and safe reapplication; do not copy production rows into public fixtures.
2. Record a production backup/restore point. Pause scheduled collectors while applying the reviewed migration in a maintenance window. It changes the OSM daily primary key and briefly locks that table.
3. Apply the SQL with the database's supported SQL client. No migration executes during app startup or build.
4. Deploy only after a separate release decision. Configure an isolated `PREVIEW_DATABASE_URL` for preview data; otherwise preview is offline.
5. Resume collection and inspect `/api/live` and `/data`. Expect MCP initial sync, package/history catchup, and corrected robots/OSM coverage to start incomplete.

## Rollback

Keep the additive columns and checkpoint tables. Stop collectors before rolling back app code. The old OSM writer targets a primary key on `day`; that writer is incompatible with the new `(day, collection_version)` key. Therefore a code rollback **must keep OSM ingestion disabled** until forward repair, or restore the pre-migration database backup together with the old code. Do not drop corrected rows or rebuild the old key while both collection versions exist.

The preferred response to an application regression is a forward fix with collection paused. If restoring a backup, account for post-backup observations and document their coverage gap. No destructive automatic down migration is supplied.

## Corrected definitions

| Dataset | Corrected storage | Treatment of history |
|---|---|---|
| OSM | `collection_version=2`, seven-day dedup ledger | Version 1 retained; corrected sample charts use version 2 only |
| Robots | `external_series.source=cc-robots-v2` | Original `cc-robots` retained and never spliced into v2 |
| Radar | `radar-v2` plus `collector_state radar:*` metadata | Whole normalized windows replaced; original `radar` retained |
| GH Archive | Version 2 completed-hour markers | Old daily history remains labelled; current comparable summaries require certified complete days |
| MCP | `sync_version=2`, status and fixed-boundary checkpoint | Initial v2 synchronization must complete before current totals are shown |

Robots v2 measures explicit full-block directives for named tokens, after merging matching groups. Wildcard directives are reported separately. It is not a complete RFC 9309 policy evaluator: `Allow` exceptions, path matching and network behavior require separate evidence.

## Historical worker datasets

GitHub Actions and their archive-processing scripts are not included. GH Archive, Common Crawl robots census, and ai.robots.txt history remain historical snapshots unless their collection is deliberately moved to a non-GitHub scheduler. Routine MCP, OSM, package, baseline, watched-repository, and other API collectors continue through the daily Vercel trigger and retain their independent checkpoints.

Do not run an unbounded multi-year backfill to fill cosmetic chart gaps. Publish missing coverage and budget any future historical repair on the platform chosen to run it.

## Bounded repairs and retention changes

Define a repair's source, environment, exact UTC range, maximum pages/batches, expected row/version impact and stopping condition before running it. Inspect existing coverage and progress first. Correct data and its checkpoint together; preserve previous usable observations on upstream failure. Stop if validation fails, the bounded budget is exhausted or the source rate-limits access. A partial result should keep its resumable state.

Retention is an existing daily collector, not a blanket instruction to clear old tables. See the [retention matrix](data-contracts.md#retention) before changing it. The owner prefers removing old detail while preserving summaries. Prove those summaries and their coverage survive on isolated fixtures before extending cleanup; do not drop history, checkpoint or completion tables to reduce database size.

## Source contracts

- [MCP official API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md): opaque cursor, updated-since filter, latest version and deletion status.
- [Cloudflare Radar normalization](https://developers.cloudflare.com/radar/concepts/normalization/): normalized series depend on their observation window; scales must not be stitched.

## Social sample rollout and rollback

Apply the reviewed additive [0002_social_samples.sql](../drizzle/0002_social_samples.sql) before enabling this application revision against a database. It creates only the new aggregate table/index and changes no historical rows. The earlier 0001 migration is a prerequisite on databases that have not already received it; do not re-run old repairs as a substitute for checking migration state. No production migration runs during build/startup.

For local QA, `npx tsx scripts/qa-database.ts migrate` applies the migrations only to an explicitly configured loopback `gcdtracker_qa*` database. `migration-check` verifies historical preservation and safe reapplication in its separate disposable database.

Production already has a configured Radar token according to the September 11 environment-name check; do not copy it into public or preview configuration. Its current endpoint permissions still require validation. Social sources need no account key. Previews require an isolated `PREVIEW_DATABASE_URL`, or remain explicitly offline; `/demo` supplies labelled synthetic examples.

After a separately authorized release, let the existing daily schedule run and inspect source outcomes and sample timestamps. A protected manual call to `/api/ingest/bluesky` or `/api/ingest/mastodon` attempts at most one sample that UTC day; it is a write, not a diagnostic read. Failed/reserved days are not automatically retried. Wait until the next UTC date rather than deleting checkpoints to bypass the cap.

For rollback, set `SOCIAL_COLLECTION_ENABLED=0` and revert application code. Keep `social_samples` and its checkpoints; older code simply does not read them. Leave existing historical datasets and migrations intact. No destructive down migration or bulk social backfill is provided.
