# Cost controls

The operating goal is no paid infrastructure for the current site. GitHub is source hosting only. This is a project constraint, not a promise about future pricing or unrelated account charges. Current verification belongs in [status](status.md), not in an undated assurance.

## Where usage comes from

| Service | Project activity | What a review must establish |
|---|---|---|
| GitHub | Source files, issues and PRs | Actions remains disabled, no workflow files or newly introduced metered automation, no leftover Actions storage. Check other metered features only if actually present |
| Vercel | Git-triggered builds, page/API delivery, caches and daily ingestion | Actual account plan, included usage and add-ons; a source push can trigger a Vercel build even with Actions disabled |
| Neon | Query compute, retained data/indexes, history/branches and transfer | Actual organization/project billing plan and provider usage. A SQL connection, repo setting or Vercel Hobby membership does not establish the Neon plan |
| Upstream sources | API reads and public dataset access | Whether access is public/free or uses a paid credential; respect rate limits and bounded work |

The application has no model-inference SDK in its current production dependencies. Adding an API key, model call, paid scheduler, storage integration or upgraded hosting plan requires a new cost assessment rather than assuming it fits the present design.

## Read-only review

From the repository root, use Git and the authenticated GitHub CLI. These commands inspect state; they do not trigger workflows:

```sh
git remote -v
git ls-files .github/workflows
gh api repos/eshin087/gcdtracker/actions/permissions
gh api repos/eshin087/gcdtracker/actions/artifacts --jq .total_count
gh api repos/eshin087/gcdtracker/actions/caches --jq .total_count
```

Verify Vercel and Neon plans in their authenticated consoles or supported read-only APIs, and compare against current official limits. Print only the fields needed for the question, not tokens or full account responses. Record when a plan or allowance could not be checked. Do not turn a cost inspection into cancellation of unrelated services or deletion of data.

Routine scheduling is in [vercel.json](../vercel.json); the [ingestion route](../src/app/api/ingest/[source]/route.ts) sets the runtime budget. Check deployed settings too: a source constant is not proof of the hosting runtime's effective limit. Historical worker datasets stay historical unless a bounded, free replacement is deliberately approved.

## Capacity and retention

Follow the owner's [retention decision](decisions.md#d6-remove-older-detail-and-preserve-summaries) and [table-specific contracts](data-contracts.md#retention). Review large/growing tables using read-only aggregate size/count queries; do not fetch raw production records to estimate growth. Keep detailed account usage privately in ignored evidence files.

A capacity estimate needs at least two dated, comparable measurements, the provider's actual quota and what it includes, and the active retention behavior. If net growth is positive, approximate remaining days as remaining quota divided by daily growth; present a range and include steady-state retention, bursts, indexes, branches and compute/transfer limits. Do not give an exhaustion date from one database-size observation.

New retention should preserve verified summaries before deleting detail, use bounded batches, and be exercised on isolated data. If preserving the required evidence within the limit is not yet possible, report that tradeoff; do not silently upgrade or discard summaries.

## Provider references

Use these official references when reviewing costs; do not treat service allowances as fixed project constants. Vercel and GitHub guidance was checked on September 11, 2026. Neon pricing could not be re-fetched during that review, so no current Neon allowance is asserted here.

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) distinguishes runner minutes and stored artifacts/caches. Disabling Actions stops new runs; storage and other account products are separate checks.
- [Vercel Hobby](https://vercel.com/docs/plans/hobby) is free within its applicable use and allowance rules; exceeding an allowance can pause a feature. This is not an uptime guarantee or a waiver for paid add-ons.
- [Vercel cron pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing) counts cron execution as function usage; moving work into a cron does not make compute unlimited.
- [Neon pricing](https://neon.com/pricing) is the source for current Free and paid allowances. Verify the actual database plan rather than inferring it from this document.

## Bounded social collection

The three-source addition uses the existing daily Vercel route, with no new scheduler, paid API, inference dependency or GitHub Actions. Social collection makes at most one Bluesky connection and two Mastodon HTTP requests per UTC day, even after failures or concurrent manual triggers. Time/processing caps live in `SOCIAL_LIMITS`; there are no archive replays, media downloads or retries. Set `SOCIAL_COLLECTION_ENABLED=0` to disable both social jobs before DB/network work.

Social storage grows by at most two aggregate rows per UTC date per methodology version (730 in a normal year), plus fixed-size per-platform checkpoints. It does not retain raw posts. This row bound is not a measured byte forecast: indexes, database history, other collectors, compute and public page delivery also consume allowances. Radar purpose adds at most one request/day and replaces its bounded 28-day group snapshot.

A free upstream source does not make unlimited site traffic free. Existing account/plan unknowns remain; this code neither changes billing plans nor promises permanent zero charges.
