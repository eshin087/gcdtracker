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

## Daily collectors reporting failed or partial for a month

**Recorded:** October 25, 2026 from read-only production checks. **Status:** causes verified in collector code and run statistics; fixes prepared on `codex/activity-flow-modes`, not yet deployed.

Over the 31 daily runs from September 25 to October 25, 2026, Wikimedia failed on 24, agentwatch failed on 30, and GitHub, Moltbook, OSM, Radar, watched repositories and Wikipedia ended partial on every run. Production also still used the retired 30-minute freshness interval, so the health pill reported stale sources permanently.

Verified causes: Wikimedia's edits metrics API returns 404 for dates not yet loaded because the dataset is published per complete month, and the first 404 aborted the Wikidata and Commons steps. One Cloudflare bot-catalog slug failed a strict pattern and aborted the registry scan. The GitHub time slice allowed about 25 search queries against 38 required ones, so the sample feed never ran and the recent-PR export stayed empty. Moltbook stored exactly 500 posts per run, its page cap, so daily counts were the cap rather than platform volume. OSM sampled the newest 800 changesets, about 90 minutes before each run. Wikipedia's heuristic cursor advanced about one hour per day and sat sixteen days behind. Radar marked every run partial for one publisher-reported non-finite ratio.

**Lesson:** a daily cadence changes what "complete" means for cursor and page-capped collectors. Treat publisher lag, by-design caps and per-series publisher states as recorded coverage, not as run failures, and keep each sub-step's outcome independent. Verify outcome history over weeks, not a single run.

For new incidents, add impact, dated evidence, confirmed cause or explicit unknown, fix/PR, verification and follow-up. Avoid copying raw headers, connection details, mail or credentials.
