# Migration, rollback and bounded repair

This PR does not migrate, merge, or deploy production. The application requires the additive schema migration before data-backed operation. Never use the QA scripts against production; they refuse non-loopback or non-QA database names.

## Release procedure

1. Create an isolated Neon branch or disposable PostgreSQL database, restore a representative schema/data sample, and run `drizzle/0001_collector_integrity.sql`. The local regression harness proves legacy preservation and safe reapplication.
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

## Source contracts
- [MCP official API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md): opaque cursor, updated-since filter, latest version and deletion status.
- [Cloudflare Radar normalization](https://developers.cloudflare.com/radar/concepts/normalization/): normalized series depend on their observation window; scales must not be stitched.
