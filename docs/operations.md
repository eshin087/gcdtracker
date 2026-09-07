# Migration, rollback and bounded repair

This PR does not migrate, merge, or deploy production. The application requires the additive schema migration before data-backed operation. Never use the QA scripts against production; they refuse non-loopback or non-QA database names.

## Release procedure

1. Create an isolated Neon branch or disposable PostgreSQL database, restore a representative schema/data sample, and run `drizzle/0001_collector_integrity.sql`. The local regression harness proves legacy preservation and safe reapplication.
2. Record a production backup/restore point. Pause scheduled collectors while applying the reviewed migration in a maintenance window. It changes the OSM daily primary key and briefly locks that table.
3. Apply the SQL with the database's supported SQL client. No migration executes during app startup, build, or CI.
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

## Bounded repairs

Use a staging URL and staging secret for dry runs and validation. Set credentials through environment variables; never paste secrets into checked-in command files.

```sh
# One hour first: inspect the payload without posting.
node scripts/gharchive.mjs --dry --from 2026-09-06-12 --to 2026-09-06-12 --max-minutes 5

# After review: at most one day, one shard, with an explicit runtime bound.
# SITE_URL and CRON_SECRET must point to the intended deployment.
node scripts/gharchive.mjs --from 2026-09-06-0 --to 2026-09-06-23 --shard 0/1 --max-minutes 20

# One explicitly chosen robots crawl and four sample files.
node scripts/robots-census.mjs --dry --crawl CC-MAIN-2026-33 --files 4 --max-crawls 1 --max-minutes 20
```

Use an actual available crawl ID from Common Crawl's index. A small four-file sample is useful for staging; keep sample sizes consistent for published comparisons. Production replacement is explicit and should record the sample design.

Normal MCP, OSM, package, baseline and watched jobs resume their own checkpoints. OSM only replays a bounded overlapping 48-hour creation sample; historical inflation cannot be reconstructed from the aggregate counters alone. Do not reset its ledger or invent retrospective corrected counts. GH Archive replaces submitted hours transactionally and removes obsolete keys; scheduler catchup is bounded to the recent window.

Do not run an unbounded multi-year backfill to fill cosmetic chart gaps. Publish the missing coverage and schedule any historical repair separately with a measured compute budget.

## Source contracts

- [MCP official API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md): opaque cursor, updated-since filter, latest version and deletion status.
- [Cloudflare Radar normalization](https://developers.cloudflare.com/radar/concepts/normalization/): normalized series depend on their observation window; scales must not be stitched.
