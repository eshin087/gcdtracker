# Open work and research roadmap

Reviewed November 9, 2026. Priorities below are recommendations, not work already performed or authorization for external changes. Keep completed work in the changelog/PR rather than a growing checklist here.

## R1: Align health with the daily schedule

**Priority:** release verification. **Status:** the daily grace window is deployed: on November 9 `/api/live` reported `schedule: daily` and no stale source. Health is still `degraded` every day, for the reasons in the [November 9 incident](incidents.md#collectors-starved-or-failing-after-the-october-26-release).

[Health defaults](../src/lib/health.ts) expect routine runs every 86,400 seconds with a two-interval grace window, matching [scheduling](../vercel.json). Historical workers retain their last outcomes but are explicitly unscheduled and excluded from routine freshness. A run is partial when a required observation is incomplete, not when a bound that defines a sample is reached. The branch `codex/collector-budget-and-radar` applies that to the Bluesky byte budget and the signing-registry scan and adds a public reason per source; it merged on November 9 as PR #15, and its deployment was not checked.

Still open after that branch: Radar fails, Moltbook's daily count is a lower bound ([R8](#r8-moltbook-volume-exceeds-the-walk-cap)), and the GitHub jobs may be refused ([R7](#r7-give-the-github-jobs-enough-time)). The first request to `/api/live` after a quiet period returns the previous snapshot, whose `stale` flags were computed when it was generated; the pill does not compare `generatedAt` with the present.

**Done when:** historical/unscheduled sources are clearly represented; partial and failed outcomes remain visible with their reason; an old cached snapshot cannot read as current; after deployment `/data` shows `success` for sources whose upstreams responded. Verify schedule delivery and checkpoint movement before claiming new observations are arriving.

## R2: Prune detail without losing historical summaries

**Priority:** next capacity task. **Status:** owner selected the policy; broader implementation remains open. October 25 measurements: 139 MB in total, with `gh_archive_hourly` at 69 MB, `forum_posts` at 21 MB and `mcp_servers` at 19 MB.

The [retention matrix](data-contracts.md#retention) shows both unbounded detail tables and metrics whose existing daily tables are not equivalent rollups. `gh_archive_hourly` is frozen historical detail whose daily rollup and completion markers already exist; confirm which census queries still read hourly rows before treating it as prunable. The Moltbook feed walk now stores only a 200-post sample per run, which bounds `forum_posts` growth.

**Done when:** each growing detail table has a documented raw-data purpose, summary/coverage dependency and retention window; needed summaries are durable and versioned; isolated before/after tests prove chart totals survive cleanup; cleanup is bounded and observable; a dated growth estimate uses actual provider limits. Do not repurpose operational dedup or completion metadata as disposable detail.

## R3: Close cost and runtime verification gaps

**Priority:** before promising zero cost or expanding collection. **Status:** partially verified.

Vercel Hobby and disabled GitHub Actions were checked on September 11; GitHub Actions was rechecked disabled with zero artifacts and caches on October 25. Neon billing has not been checked from this repository. The ingestion source declares `maxDuration = 240`; the October 25 run finished in about 170 seconds, so the deployed runtime honours at least that much.

**Done when:** actual plans and relevant allowances are verified without exposing account details; collection is confirmed to fit the active runtime; database/compute/transfer growth is measured; remaining unknowns are explicit. No plan upgrades are part of this item.

## R4: Replace the frozen homepage archive figures

**Priority:** next product task. **Status:** released October 26 via [PR #14](https://github.com/eshin087/gcdtracker/pull/14) as GitHub search census v1. Verified on the production homepage on November 9: the tiles show a current figure and the heatmap has one comparable day per run from October 26.

Each day needs 16 detector and 7 reference queries. The planned backfill of the previous 30 days did not happen: a run had at most two spare queries, and they went to the oldest day in the window, which left the window the next day. On the branch `codex/collector-budget-and-radar` the daily run no longer fills 30-day gaps; it repairs at most one earlier day from the last week after its required work. Days before October 26 keep their detector counts without reference counts and stay marked incomplete. The 30-day window becomes fully comparable on its own around November 25. Filling earlier days would need search budget the daily invocation does not have; see [R7](#r7-give-the-github-jobs-enough-time).

Decision [D2](decisions.md#d2-preserve-the-distinctive-homepage) keeps the heatmap. The GH Archive view remains as labelled history, and the two detectors are never spliced.

**Done when:** the public Methods page explains the search census and the detector change. Its GitHub section still describes only GH Archive; the explanation currently lives under the homepage heatmap.

## R5: Release the September work

**Status:** released October 26, 2026 as `068098d` via [PR #12](https://github.com/eshin087/gcdtracker/pull/12), with migration 0002 applied first. PRs #8 and #3 are closed. The post-release runs were checked on November 9: Wikimedia, Wikipedia and OSM reach `success`; the remaining problems are in the [November 9 incident](incidents.md#collectors-starved-or-failing-after-the-october-26-release).

## R6: Trim and cache the heavy explorer pages

**Priority:** low. **Status:** measured October 25.

`/github` returned 1.8 MB of HTML, of which 1.2 MB is the server-component payload for the census view, and the Forums, GitHub and Wikipedia optional catch-all routes render dynamically on every request (`private, no-store`), so each visit queries the database. Traffic is low, so cost impact is small today.

**Done when:** the catch-all pages declare their known views for static generation with revalidation, the census payload is reduced to what the view renders, and page size and cache headers are re-measured on the production alias.

## R7: Give the GitHub jobs enough time

**Priority:** decide after the first deployed run of `codex/collector-budget-and-radar`. **Status:** open; needs an owner decision.

Three collectors share one GitHub search allowance inside one 240-second invocation: the census (23 queries a day plus one sample-feed query), text signatures (up to 12) and watched repositories (up to 15 repositories). Of the thirteen runs from October 27 to November 8, the two jobs after the census collected nothing on twelve. The branch orders them by what a missed day costs, bounds each one, and waits for the pause GitHub asks for when the remaining time allows.

What the branch cannot settle is which limit applies. If the refusal carries a window reset a few seconds away, waiting fits and all three complete. If it carries a `retry-after` of about a minute, the wait does not fit: going by the November 8 run times, the census needs roughly 50 seconds, the other two jobs roughly 60, and the other collectors roughly 95 of the 225 usable seconds. `/data` will show the basis after the first run.

Options if the long pause applies, each a scheduling or runtime decision: raise `maxDuration` from 240 to 300 seconds after confirming the plan allows it; add a second daily invocation for signatures and watched repositories; or run the other collectors between the census and the two smaller jobs, which needs per-job time budgets because several collectors sit close to their current slice. A second invocation would also make history backfill for the census possible.

**Done when:** text-signature finals arrive daily, the watched rotation advances daily, the sample feed fills `github_events`, and the choice is recorded in [decisions](decisions.md) and [cost controls](cost-controls.md).

## R8: Moltbook volume exceeds the walk cap

**Priority:** owner decision. **Status:** open.

The daily walk reads at most 60 pages of 100 posts. From November 1 to 7 every day recorded between 5,726 and 6,150 posts and the walk stopped before reaching the previous run, so the series has flattened at the ceiling and each day is a lower bound. The Forums page and the homepage inspector say so, and the run stays `partial` because the daily count is incomplete. In the first three hours of November 8 the feed carried 1,082 posts, which suggests more than 8,000 a day.

Raising the page cap costs one request per 100 posts and about 0.3 seconds each, taken from a run with little spare time ([R7](#r7-give-the-github-jobs-enough-time)). The alternative is to keep the cap and present the series as a capped sample.

**Done when:** the cap is raised with its request and time cost recorded, or the lower-bound presentation is accepted and the outcome rule for a capped walk is written down.

## R9: Presentation and interpretation fixes

**Priority:** low. **Status:** observed on production November 9; fixed on branch `codex/display-fixes` the same day, merged on November 10 UTC as [PR #16](https://github.com/eshin087/gcdtracker/pull/16); its deployment was not checked. Validation is in [status](status.md#validation). The items below describe production until a deployment.

- The homepage flow shows two rows labelled "Cursor": the branch-prefix detector and the app account lose their distinguishing suffix in [stats-sources.ts](../src/lib/stats-sources.ts).
- Forums shows the current UTC day as 0 before the daily run, and days without a row as 0, which conflicts with [D3](decisions.md#d3-evidence-must-remain-interpretable).
- Social publishing shows a daily zero: 0 disclosure matches in 2,913 sampled posts over 13 days. A pooled rate with its sample size would be more informative than a zero from about 150 posts.
- New agents dates signing-registry entries by when the alphabetical scan reached them, so long-standing entries look new during a pass.
- The homepage census chart overlaps its "2015" and "2016" axis labels, and the heatmap's month and weekday labels render much larger than surrounding text.
- The GitHub page sums text-signature counts over 30 days although only one day was collected between October 27 and November 8; the number of days is shown only in a tooltip.

## Research features after reliability

| Idea | Value | Completion criteria |
|---|---|---|
| Crawler-purpose trends | Separate training, search indexing and user-triggered retrieval | Comparable observation windows, disclosed purpose mapping and visible coverage |
| Crawl-to-referral trends | Compare each platform's reads with readers it sends back | Source-compatible denominators, missing/zero handling and units; no cross-network extrapolation |
| Coverage timeline | Explain gaps, outages and definition changes on the graphs | Stored evidence for annotations, separation of absent/partial/zero, preserved legacy boundaries; the Moltbook walk and OSM time-spread boundaries of October 2026 are the first candidates |
| Crawler-policy history | Show changes in explicit blocking by operator and purpose | Versioned named-token directive measure; policy never presented as observed crawler compliance |

Preserve the existing homepage animation, multi-year lines, heatmap and left navigation while adding metadata. Historical GH Archive and robots gaps require an explicit collection decision, not generated values or silent reactivation of removed workers. The only tracked agent-like Wikidata bot last edited in May 2025; broadening that list is a coverage decision, not a repair.

Multi-site measurement and controlled crawler experiments remain deferred. Revisit only with a useful evidence design and a confirmed free operating path; many crawlers do not run browser analytics JavaScript, so client-only collection cannot establish broad crawler coverage.
