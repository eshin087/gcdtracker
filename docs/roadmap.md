# Open work and research roadmap

Reviewed October 25, 2026. Priorities below are recommendations, not work already performed or authorization for external changes. Keep completed work in the changelog/PR rather than a growing checklist here.

## R1: Align health with the daily schedule

**Priority:** release verification. **Status:** daily cadence, unscheduled historical-source handling and per-step collector outcomes implemented on the three-source and flow branches; production still ran the 30-minute interval on October 25, so its health pill reported every source stale.

[Health defaults](../src/lib/health.ts) expect routine runs every 86,400 seconds with a two-interval grace window, matching [scheduling](../vercel.json). Historical workers retain their last outcomes but are explicitly unscheduled and excluded from routine freshness. The collector fixes of October 25 make by-design caps, publisher lag and per-series publisher states recorded coverage instead of failed or partial runs.

**Done when:** the daily grace window is deployed; historical/unscheduled sources are clearly represented; partial and failed outcomes remain visible; a newly generated public snapshot can be distinguished from cached data; after deployment `/data` shows `success` for sources whose upstreams responded. Verify schedule delivery and checkpoint movement before claiming new observations are arriving.

## R2: Prune detail without losing historical summaries

**Priority:** next capacity task. **Status:** owner selected the policy; broader implementation remains open. October 25 measurements: 139 MB in total, with `gh_archive_hourly` at 69 MB, `forum_posts` at 21 MB and `mcp_servers` at 19 MB.

The [retention matrix](data-contracts.md#retention) shows both unbounded detail tables and metrics whose existing daily tables are not equivalent rollups. `gh_archive_hourly` is frozen historical detail whose daily rollup and completion markers already exist; confirm which census queries still read hourly rows before treating it as prunable. The Moltbook feed walk now stores only a 200-post sample per run, which bounds `forum_posts` growth.

**Done when:** each growing detail table has a documented raw-data purpose, summary/coverage dependency and retention window; needed summaries are durable and versioned; isolated before/after tests prove chart totals survive cleanup; cleanup is bounded and observable; a dated growth estimate uses actual provider limits. Do not repurpose operational dedup or completion metadata as disposable detail.

## R3: Close cost and runtime verification gaps

**Priority:** before promising zero cost or expanding collection. **Status:** partially verified.

Vercel Hobby and disabled GitHub Actions were checked on September 11; GitHub Actions was rechecked disabled with zero artifacts and caches on October 25. Neon billing has not been checked from this repository. The ingestion source declares `maxDuration = 240`; the October 25 run finished in about 170 seconds, so the deployed runtime honours at least that much.

**Done when:** actual plans and relevant allowances are verified without exposing account details; collection is confirmed to fit the active runtime; database/compute/transfer growth is measured; remaining unknowns are explicit. No plan upgrades are part of this item.

## R4: Replace the frozen homepage archive figures

**Priority:** next product task. **Status:** implemented on branch `codex/search-homepage-census` on October 26 as GitHub search census v1, not merged or deployed. After deployment the tiles show no value until the first comparable days exist. Each day needs 16 detector and 7 reference queries; the previous 30 days backfill with the spare search budget of each daily run, which may take several weeks. Partially collected days are completed first so a short slice still converges.

The three homepage headline tiles and the daily heatmap read GH Archive summaries. The archive worker was retired on September 9, 2026, so the tiles show no value with "0/7 comparable UTC days" and the 2026 heatmap row has 4 validated days out of 298. Decision [D2](decisions.md#d2-preserve-the-distinctive-homepage) keeps the heatmap; its data source is what stopped.

**Proposed direction:** feed the tiles and heatmap from the GitHub search daily series, which finalizes every UTC day, as a separately labelled version with its own denominator (a daily `is:pr created:<day>` total). Keep the GH Archive view as labelled history. Any replacement must keep missing, incomplete and zero distinct and must not splice the two detectors into one line.

**Done when:** the homepage shows a current, labelled agent-PR figure and heatmap; the archive history remains available and labelled; browser tests cover both; the Methods page explains the detector change.

## R5: Release the September work

**Priority:** before the collector fixes can take effect. **Status:** open; diagnosed October 25.

Production serves `main`, which has the README rewrite but none of PRs #8, #9 and #10 or the October 25 collector fixes. [PR #12](https://github.com/eshin087/gcdtracker/pull/12) carries PR #8's commits plus this branch, with the README conflict resolved. The `social_samples` table from migration 0002 does not exist in production.

**Done when:** PR #12 keeps the portfolio README (done); migration 0002 is applied under the [operations](operations.md) procedure; the combined branch is reviewed and merged; `/social`, the social export and the health pill are verified on the production alias; PR #3 is closed or rebased.

## R6: Trim and cache the heavy explorer pages

**Priority:** low. **Status:** measured October 25.

`/github` returned 1.8 MB of HTML, of which 1.2 MB is the server-component payload for the census view, and the Forums, GitHub and Wikipedia optional catch-all routes render dynamically on every request (`private, no-store`), so each visit queries the database. Traffic is low, so cost impact is small today.

**Done when:** the catch-all pages declare their known views for static generation with revalidation, the census payload is reduced to what the view renders, and page size and cache headers are re-measured on the production alias.

## Research features after reliability

| Idea | Value | Completion criteria |
|---|---|---|
| Crawler-purpose trends | Separate training, search indexing and user-triggered retrieval | Comparable observation windows, disclosed purpose mapping and visible coverage |
| Crawl-to-referral trends | Compare each platform's reads with readers it sends back | Source-compatible denominators, missing/zero handling and units; no cross-network extrapolation |
| Coverage timeline | Explain gaps, outages and definition changes on the graphs | Stored evidence for annotations, separation of absent/partial/zero, preserved legacy boundaries; the Moltbook walk and OSM time-spread boundaries of October 2026 are the first candidates |
| Crawler-policy history | Show changes in explicit blocking by operator and purpose | Versioned named-token directive measure; policy never presented as observed crawler compliance |

Preserve the existing homepage animation, multi-year lines, heatmap and left navigation while adding metadata. Historical GH Archive and robots gaps require an explicit collection decision, not generated values or silent reactivation of removed workers. The only tracked agent-like Wikidata bot last edited in May 2025; broadening that list is a coverage decision, not a repair.

Multi-site measurement and controlled crawler experiments remain deferred. Revisit only with a useful evidence design and a confirmed free operating path; many crawlers do not run browser analytics JavaScript, so client-only collection cannot establish broad crawler coverage.
