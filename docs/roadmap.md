# Open work and research roadmap

Reviewed September 11, 2026. Priorities below are recommendations, not work already performed or authorization for external changes. Keep completed work in the changelog/PR rather than a growing checklist here.

## R1: Align health with the daily schedule

**Priority:** release verification. **Status:** daily cadence and unscheduled historical-source handling implemented on the three-source branch; production cache/delivery verification remains open.

[Health defaults](../src/lib/health.ts) now expect routine runs every 86,400 seconds with a two-interval grace window, matching [scheduling](../vercel.json). Historical workers retain their last outcomes but are explicitly unscheduled and excluded from routine freshness. The public health snapshot recorded in [status](status.md) predates this review and must not be assumed current.

**Done when:** daily sources have an appropriate grace window; historical/unscheduled sources are clearly represented; partial and failed outcomes remain visible; a newly generated public snapshot can be distinguished from cached data; tests cover daily timing, disabled/historical sources and stale response timestamps. Verify schedule delivery and checkpoint movement before claiming new observations are arriving.

## R2: Prune detail without losing historical summaries

**Priority:** next capacity task. **Status:** owner selected the policy; broader implementation remains open.

The [retention matrix](data-contracts.md#retention) shows both unbounded detail tables and metrics whose existing daily tables are not equivalent rollups. Adding more deletes without investigating those dependencies can erase future historical evidence.

**Done when:** each growing detail table has a documented raw-data purpose, summary/coverage dependency and retention window; needed summaries are durable and versioned; isolated before/after tests prove chart totals survive cleanup; cleanup is bounded and observable; a dated growth estimate uses actual provider limits. Do not repurpose operational dedup or completion metadata as disposable detail.

## R3: Close cost and runtime verification gaps

**Priority:** before promising zero cost or expanding collection. **Status:** partially verified.

Vercel Hobby and disabled GitHub Actions were checked; Neon billing was not. The ingestion source declares `maxDuration = 240`, but the effective deployed configuration and daily job completion were not reviewed in this task.

**Done when:** actual plans and relevant allowances are verified without exposing account details; collection is confirmed to fit the active runtime; database/compute/transfer growth is measured; remaining unknowns are explicit. No plan upgrades are part of this item.

## Research features after reliability

| Idea | Value | Completion criteria |
|---|---|---|
| Crawler-purpose trends | Separate training, search indexing and user-triggered retrieval | Comparable observation windows, disclosed purpose mapping and visible coverage |
| Crawl-to-referral trends | Compare each platform's reads with readers it sends back | Source-compatible denominators, missing/zero handling and units; no cross-network extrapolation |
| Coverage timeline | Explain gaps, outages and definition changes on the graphs | Stored evidence for annotations, separation of absent/partial/zero, preserved legacy boundaries |
| Crawler-policy history | Show changes in explicit blocking by operator and purpose | Versioned named-token directive measure; policy never presented as observed crawler compliance |

Preserve the existing homepage animation, multi-year lines, heatmap and left navigation while adding metadata. Historical GH Archive and robots gaps require an explicit collection decision, not generated values or silent reactivation of removed workers.

Multi-site measurement and controlled crawler experiments remain deferred. Revisit only with a useful evidence design and a confirmed free operating path; many crawlers do not run browser analytics JavaScript, so client-only collection cannot establish broad crawler coverage.
