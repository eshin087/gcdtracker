---
name: gcdtracker-data-quality
description: Diagnose gcdTracker missing, zero or stale data and review changes to collectors, metrics, evidence attribution or retention. Preserves coverage, historical definitions and retry correctness across the existing public sources.
---

# gcdTracker data quality

Read [data contracts](../../../docs/data-contracts.md) and the relevant source implementation. Use [operations](../../../docs/operations.md) for repairs, and [status](../../../docs/status.md) for dated limitations. Commands run from the repository root.

## Diagnose the observation before changing it

Identify the requested URL, dataset, metric and expected period. `/demo` is synthetic; Vercel previews require an isolated `PREVIEW_DATABASE_URL`; observed pages must not silently substitute demo values. Check the deployed commit and migration state if local and production behavior differ.

Start with the public `/api/live` and `/data` views. Check `generatedAt` before trusting freshness, then `lastIngest`, per-source outcome and observation timestamps. HTTP 200 can contain `partial`; `db: true` in a cached response is not a new connection test. Confirm source coverage rather than changing a missing value to zero.

Compare the actual scheduler with the health interval. GitHub Actions is intentionally disabled. GH Archive, robots census and ai.robots.txt historical workers are unscheduled; their old data is not evidence of a newly failed worker. See the open cadence issue in the roadmap.

An ingestion GET is usually a write: it can collect data and persist a run. The GH Archive and robots-census GET branches are special status reads; inspect their query contract first. Do not hit `/api/ingest/all` merely to inspect health. Use read-only summaries/checkpoint inspection to establish where progress stopped without exposing credentials or raw production rows.

## Repair the relevant contract

- MCP: hold a fixed sync boundary, persist opaque cursor progress, guard updates by source timestamp, handle deleted entries and withhold complete totals until initial synchronization finishes.
- OSM: preserve creation-time bounds, sampling cap, dedup horizon and atomic count updates. Keep collection versions separate; shortening dedup retention below the overlap can inflate totals.
- Archive: atomically replace each corrected hour, delete obsolete keys, rebuild daily totals under locks and write completion markers in the same commit. Do not recreate removed runner scripts as an incidental repair.
- Packages/baselines/watched repositories: retain independent progress and fairness. Incomplete search results cannot finalize a zero or advance a complete window.
- Radar: retain normalization, units, provenance and the observation window. Replace a full normalized group snapshot; do not stitch incompatible scales.
- Robots: explicit named-token full-block directives, matching groups merged, wildcard separate. Do not describe this as full robots policy evaluation or observed compliance.

For a new metric, specify evidence, unit, window, denominator, missing/zero behavior, attribution level and storage/version impact. Package downloads are not executions; bot activity is not necessarily AI; operator evidence does not identify a model. Keep incompatible historical series distinct.

For retention, preserve and verify the needed summaries before removing detail. Some existing daily tables measure different things from their similarly named detail tables. Preserve checkpoints, coverage and methodology metadata; a size target alone is not a deletion criterion.

## Validate and report

Add the narrow regression that reproduces the changed behavior. Use local fixtures for upstream failures and retries. Transaction, replay, rollback or migration changes need isolated database tests from [QA](../../../docs/qa.md); never run fixture setup against production. Validate public field allowlists and safe CSV handling when changing output.

Report source outcome, observation coverage, preserved history and remaining limits separately. Update data contracts/changelog when definitions change and status/incidents when the evidence warrants it. Do not claim a source is current merely because its request returned successfully.
