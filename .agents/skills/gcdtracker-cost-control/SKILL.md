---
name: gcdtracker-cost-control
description: Review gcdTracker cost exposure, free-tier capacity, retention and accidental automation. Use for billing questions, quota incidents, storage forecasts or proposals that increase collection; not as a general account-cancellation workflow.
---

# gcdTracker cost control

Read [cost controls](../../../docs/cost-controls.md), [accepted decisions](../../../docs/decisions.md) and the [retention matrix](../../../docs/data-contracts.md#retention). Commands run from the repository root. Prioritize no paid GitHub automation and preservation of historical summaries.

## Establish actual exposure

Inspect current workflow files, scheduler configuration, production dependencies and proposed changes. Verify repository Actions permissions and any stored artifacts/caches with the read-only commands in the cost guide. GitHub source hosting, Actions runs/storage and Vercel Git-triggered builds are separate systems.

Read actual Vercel and Neon plans from authenticated provider settings where available. Consult current official pricing/limit docs before a current cost claim; date the check. Report unverified plans as unknown. A database connection or Vercel Hobby plan does not establish the database's billing tier. Print only required nonsecret fields from provider responses.

Scope cost conclusions to this project. Account-wide subscriptions, domains or other repositories need their own evidence. Do not claim a permanent zero-cost guarantee, and do not equate hitting a free limit with automatic paid overages without checking the plan behavior. Free-tier suspension can preserve the cost goal while interrupting the site.

## Review growth and proposed controls

Estimate capacity from multiple dated aggregate measurements, provider quota definitions and current retention, not one database size. Include compute/transfer and preview/branch usage where relevant. Keep raw account usage privately; publish a sanitized conclusion only.

Trace which charts and denominators use a detail table before recommending pruning. The owner prefers removing old detail while keeping historical summaries. Existing retention is not universal and similarly named daily/detail tables may measure different evidence. Verify rollups and coverage survive cleanup, preserve dedup/checkpoint/completion state, and bound any approved deletion.

Prefer reduced collection volume, appropriate caching and justified retention within existing free allowances. Do not re-enable GitHub Actions, introduce paid runners, start a trial, move jobs to paid infrastructure or run a long backfill as an incidental fix. Routine Vercel ingestion remains separate from the intentionally retired historical workers.

This review is read-only unless the user authorizes a concrete change. A documentation policy does not authorize deleting data, cancelling unrelated services or changing billing. For a requested cost fix, make the proposed result reviewable and perform already-authorized actions without redundant confirmation.

## Report

Separate confirmed configuration, measured usage, forecasts and unknowns. State the effect of each implemented control on cost and freshness. Verify remote settings after authorized changes, and update status/cost docs with the check date. If no live billing access exists, say what remains unverified rather than treating the free-tier intent as proof.
