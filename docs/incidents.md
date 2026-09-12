# Incident notes

This is a compact record of failures with reusable lessons, not a dump of production logs. Entries reconstructed from prior requests are labelled as such. Record the symptom separately from a confirmed cause; keep private evidence outside the repository.

## GitHub Actions quota notifications and automation retirement

**Recorded:** September 11, 2026. **Status:** retirement verified; original account-wide quota attribution was not independently reconstructed here.

The owner reported an email about exhausted GitHub Actions minutes and requested source hosting only. [PR #7](https://github.com/eshin087/gcdtracker/pull/7) removed workflow definitions and runner-only scripts; GitHub API checks on September 11 confirmed Actions disabled and zero artifacts/caches. The PR merged at `2026-09-10T04:10:00Z`.

Routine collection remains in Vercel. GH Archive, Common Crawl robots census and ai.robots.txt history lost their scheduled workers and now remain historical snapshots. Local QA is still available.

**Lesson:** checking in source, GitHub automation and Vercel builds have different cost/operating paths. Do not restore removed jobs to make stale historical series appear fresh. Track the health-cadence follow-up in [R1](roadmap.md#r1-align-health-with-the-daily-schedule).

## Preview confusion, merged changes not visible and empty data

**Recorded:** September 11, 2026 from prior owner reports. **Status:** historical symptoms; no single shared root cause established by this documentation review.

The owner encountered Vercel login protection while opening previews, saw merged changes missing from production, then reported zero data. The history contains subsequent fixes, but it does not establish that all symptoms had the same cause. Keep that uncertainty instead of inventing a diagnosis.

**Known current behavior:** previews select `PREVIEW_DATABASE_URL`; without it they are offline. `/demo` uses synthetic fixtures. A local URL, a Vercel preview and the production alias can serve different revisions and datasets. Schema migration is separate from code deployment. These are diagnostic branches, not a retrospective proof of cause.

**Lesson:** identify the exact URL/environment and deployed commit first, then inspect observation freshness, source outcomes and migrations. Do not promise that waiting will fix missing data without evidence of a progressing collector. See [operations](operations.md#preview-and-production-diagnosis).

For new incidents, add impact, dated evidence, confirmed cause or explicit unknown, fix/PR, verification and follow-up. Avoid copying raw headers, connection details, mail or credentials.
