# Project status

Verified October 25, 2026 (local date). Recheck deployed revision, source freshness and billing settings before relying on them.

## Current work

Collector accuracy fixes are committed (`04e7c74`) and pushed on `codex/activity-flow-modes`, merged with `main` at `847f467`, and open as [PR #12](https://github.com/eshin087/gcdtracker/pull/12) against `main`. They cover Wikimedia metrics lag handling with isolated steps, a time-spread Wikipedia tier-2 sample, tolerant signature-registry slugs, GitHub work ordering without provisional current-day counts, a Moltbook feed walk with durable coverage, Radar partial logic for absent values only, an eight-slot OSM sample, and a rebalanced daily job order. The Forums, Maps and Wikipedia pages describe the sampling. No schema, migration, dependency, scheduler or billing change is involved; `collector_state` gains one key, `moltbook:coverage`. See the [changelog](../CHANGELOG.md) and [data contracts](data-contracts.md).

R4 is implemented on `codex/search-homepage-census` (not merged, not deployed): the homepage tiles and default heatmap source use the GitHub search census v1, the GH Archive history stays as a separately labelled heatmap source, and the collector stores the per-day reference counts. On that branch ([PR #14](https://github.com/eshin087/gcdtracker/pull/14)), after addressing two automated review findings (full bot-account and branch-prefix overlap measurement, and reference backfill priority): lint, TypeScript, 319 unit tests and 44 integration tests on a disposable PostgreSQL passed; the full 33-test seeded browser suite passed on the first revision of the branch and was not re-run after these fixes, which did not change the page components. See [data contracts](data-contracts.md#github-search-census-version-1).

## Verified state

| Area | Evidence and limits |
|---|---|
| Production | `gcdtracker.vercel.app` serves remote `main` at `e396e21` ([README PR #11](https://github.com/eshin087/gcdtracker/pull/11), deployed October 25, 21:14 UTC). Every route returned 200 except `/social` and the social export, which are not on `main`. The database is connected and the daily cron ran at 03:47 UTC in about 170 seconds |
| GitHub base | Remote main is `e396e21`. [PR #8](https://github.com/eshin087/gcdtracker/pull/8) (`codex/project-guide` to main) is open; its commits are all contained in PR #12, which resolves the README conflict by keeping main's rewrite and re-adding this branch's lines, so #8 becomes redundant once #12 merges. PR #12 was mergeable and clean on October 25 with its Vercel preview build passing; that preview is not production. [PR #3](https://github.com/eshin087/gcdtracker/pull/3) has been stale since September 8. PRs #9 and #10 merged into `codex/project-guide`, not main |
| Actions | Read-only API check: disabled, zero artifacts, zero caches, no workflow files |
| Production health | Deployed code still expects every source every 30 minutes, so `/api/live` marked every source stale and the pill reported that collection needs attention. This branch's daily interval is not deployed |
| Collector outcomes, 31 daily runs (September 25 to October 25) | wikimedia failed 24; agentwatch failed 30; github, moltbook, osm, radar, watched and wikipedia partial on all 31; baseline, botcommits, packages, ipranges, mcp, github-signatures and retention mostly success. Verified causes are in [incidents](incidents.md) |
| Data freshness | Rows dated October 24 or 25: GitHub search daily, Radar operator, bot-share and crawl-refer, npm and PyPI, OSM, Moltbook, MCP, IP ranges, watched signals. Historical by design: GH Archive daily ends September 9 (worker retired) and the robots census August 7. Publisher lag: Wikimedia daily totals end September 30, Hugging Face agent usage September 30. Empty: `github_events` has 0 rows; `/api/export/social_samples.json` is 404 on `main` |
| Database | 139 MB in total: `gh_archive_hourly` 69 MB, `forum_posts` 21 MB, `mcp_servers` 19 MB. Migration 0001 markers are present; the `social_samples` table from migration 0002 does not exist in production |
| Cost | No new scheduler, dependency, paid API or storage integration. The Moltbook walk adds at most 60 requests per day and stores 200 posts per run instead of 500; the OSM change keeps eight requests per run. Vercel and Neon plan tiers were not re-verified from the CLI; check both dashboards |

## Validation

On this working tree: lint, TypeScript and all 311 unit tests passed across 36 files, including new Moltbook, Wikimedia-metrics, Radar, OSM slot and signature-registry cases. An offline production build passed and confirmed that the Forums, GitHub and Wikipedia routes render dynamically on demand. On a fresh disposable PostgreSQL 16 container, `init` and `migration-check` passed and the integration suite passed all 42 tests, including the two new cases in `tests/moltbook.integration.test.ts` that exercise the feed walk's seed query, guarded daily and sample writes, and capped-day coverage. Browser checks were limited to an offline local build and the live production site; the seeded browser suite was not repeated. The container was stopped afterwards.

No production write, migration, merge or deployment was performed. Production checks used the public site, its exports, read-only Vercel and GitHub CLI commands, and aggregate read-only database queries whose outputs stayed out of the repository.

## Next steps and limitations

- Review PR #12. Apply migration 0002 to production before merging, because merging to `main` triggers a Vercel production build and the social collectors write to `social_samples`; follow [operations](operations.md#social-sample-rollout-and-rollback). Neither the migration nor the merge has been performed.
- After deployment, confirm on `/data` that wikimedia, agentwatch, radar and osm reach `success`, that moltbook and github reach `success` once the first feed walk and the next finalization complete, and that the pill leaves its degraded state. The first Moltbook walk may be partial and will list capped days on the Forums page.
- The homepage headline tiles and daily heatmap depend on retired GH Archive data and stay frozen at September 9; see [R4](roadmap.md#r4-replace-the-frozen-homepage-archive-figures).
- Radar purpose endpoint permissions, Neon plan verification, retention ([R2](roadmap.md#r2-prune-detail-without-losing-historical-summaries)) and the GitHub page payload ([R6](roadmap.md#r6-trim-and-cache-the-heavy-explorer-pages)) remain open.
