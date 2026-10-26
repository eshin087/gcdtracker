# Project status

Verified October 26, 2026, 06:50 UTC. Recheck deployed revision, source freshness and billing settings before relying on them.

## Current work

Released October 26, 2026: [PR #12](https://github.com/eshin087/gcdtracker/pull/12) merged into `main` as `068098d` at 06:46 UTC, carrying the handbook, the Radar purpose and social reports, the three-mode activity flow and the October 25 collector fixes (`04e7c74`). Migration 0002 was applied to production at 06:46 UTC, immediately before the merge. `collector_state` gains one key, `moltbook:coverage`, at the first post-release run. See the [changelog](../CHANGELOG.md) and [data contracts](data-contracts.md).

R4 ([PR #14](https://github.com/eshin087/gcdtracker/pull/14), merged October 26 after docs PR #13) feeds the homepage tiles and the default heatmap source from the GitHub search census v1 and keeps the GH Archive history as a separately labelled heatmap source; the collector stores seven reference counts per finalized day. The tiles show no value until the first daily run after deployment finalizes a day; the 30-day history fills with spare search budget over several weeks. Checks on the merged revision: lint, TypeScript, 319 unit tests and 44 integration tests on a disposable PostgreSQL; the 33-test seeded browser suite passed on the first revision of the branch. See [data contracts](data-contracts.md#github-search-census-version-1).

## Verified state

| Area | Evidence and limits |
|---|---|
| Production | `gcdtracker.vercel.app` serves the `068098d` release; `/social` went live about 30 seconds after the merge. Every checked route returned 200, including `/social`, `/api/export/social_samples.json` and `/api/export/radar.json`. `/github` is still 1.8 MB |
| GitHub base | Remote main is `068098d`. [PR #8](https://github.com/eshin087/gcdtracker/pull/8) is superseded: its only commit not in main, `0719a21`, is a merge with a tree identical to content main now has. PR #8 and stale [PR #3](https://github.com/eshin087/gcdtracker/pull/3) are still open because closing them was not permitted from the agent session; close them manually |
| Actions | Read-only API check: disabled, zero artifacts, zero caches, no workflow files |
| Production health | The daily interval is deployed: `/api/live` reports `schedule: daily` and no stale sources. Status remains `degraded` because the latest outcomes are from the 03:47 UTC run on October 26, which used the pre-release collectors. The fixed collectors first run at 03:47 UTC on October 27 |
| Collector outcomes, 31 daily runs (September 25 to October 25) | wikimedia failed 24; agentwatch failed 30; github, moltbook, osm, radar, watched and wikipedia partial on all 31; baseline, botcommits, packages, ipranges, mcp, github-signatures and retention mostly success. Verified causes are in [incidents](incidents.md) |
| Data freshness | Rows dated October 24 or 25: GitHub search daily, Radar operator, bot-share and crawl-refer, npm and PyPI, OSM, Moltbook, MCP, IP ranges, watched signals. Historical by design: GH Archive daily ends September 9 (worker retired) and the robots census August 7. Publisher lag: Wikimedia daily totals end September 30, Hugging Face agent usage September 30. Empty: `github_events` has 0 rows; `/api/export/social_samples.json` is 404 on `main` |
| Database | 139 MB on October 25: `gh_archive_hourly` 69 MB, `forum_posts` 21 MB, `mcp_servers` 19 MB. Migration 0002 applied October 26 in one transaction after pre-checks (0001 markers present, table absent, recent ingest runs present); afterwards `social_samples` had 11 columns, the primary key and `social_samples_day_idx`, and 0 rows. No Neon restore branch was created from the agent session; Neon point-in-time restore to 2026-10-26T06:46:00Z is the pre-migration reference |
| Cost | No new scheduler, dependency, paid API or storage integration. The Moltbook walk adds at most 60 requests per day and stores 200 posts per run instead of 500; the OSM change keeps eight requests per run. Vercel and Neon plan tiers were not re-verified from the CLI; check both dashboards |

## Validation

On this working tree: lint, TypeScript and all 311 unit tests passed across 36 files, including new Moltbook, Wikimedia-metrics, Radar, OSM slot and signature-registry cases. An offline production build passed and confirmed that the Forums, GitHub and Wikipedia routes render dynamically on demand. On a fresh disposable PostgreSQL 16 container, `init` and `migration-check` passed and the integration suite passed all 42 tests, including the two new cases in `tests/moltbook.integration.test.ts` that exercise the feed walk's seed query, guarded daily and sample writes, and capped-day coverage. Browser checks were limited to an offline local build and the live production site; the seeded browser suite was not repeated. The container was stopped afterwards.

No production write, migration, merge or deployment was performed. Production checks used the public site, its exports, read-only Vercel and GitHub CLI commands, and aggregate read-only database queries whose outputs stayed out of the repository.

## Next steps and limitations

- After the 03:47 UTC run on October 27, confirm on `/data` that wikimedia, agentwatch, radar and osm reach `success`, that bluesky and mastodon record outcomes and `social_samples` gains up to two rows, and that moltbook and github reach `success` once the first feed walk and the next finalization complete. The first Moltbook walk may be partial and list capped days on the Forums page.
- Close PR #8 and PR #3.
- The homepage headline tiles and daily heatmap depend on retired GH Archive data and stay frozen at September 9; see [R4](roadmap.md#r4-replace-the-frozen-homepage-archive-figures).
- Radar purpose endpoint permissions, Neon plan verification, retention ([R2](roadmap.md#r2-prune-detail-without-losing-historical-summaries)) and the GitHub page payload ([R6](roadmap.md#r6-trim-and-cache-the-heavy-explorer-pages)) remain open.
