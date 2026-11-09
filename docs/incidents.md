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

## Collectors starved or failing after the October 26 release

**Recorded:** November 9, 2026 from the public site, its exports and the collector source. **Status:** fixes prepared on `codex/collector-budget-and-radar`; not merged or deployed. The production run log was not read, so causes are marked as confirmed in code, inferred, or unknown.

Symptoms over the thirteen daily runs from October 27 to November 8:

- Radar stored no snapshot. Every group was last fetched on October 25, the last run before the release; the crawler-purpose group has never been stored, so the homepage Web crawling mode is empty.
- Text-signature counts and watched repositories were collected on one run, November 1. The recent-PR sample never ran and `github_events` stayed empty.
- The census reference backfill completed no earlier day: September 27, October 1 and October 9 each hold two of seven counts.
- Health read `degraded` on every run, so none of this stood out. Bluesky, agentwatch, Moltbook and the three GitHub jobs ended partial daily.

Causes:

- **Radar, inferred by elimination.** The token works: the signing-registry scan uses it against the same API and recorded entries on eleven of those dates. The release rewrote the parser so that any publisher annotation or optional metadata field with an unexpected shape rejects the whole snapshot, and its tests used only an empty annotation list. For the two summary groups, whose requests did not change, that validation is the only failure path the release added. The stored message would confirm it.
- **Census backfill, confirmed in code.** Missing reference counts were ordered oldest first inside a 30-day window. The day that received the run's one or two spare queries left the window the next day, so the rule to finish started days first never applied.
- **Sample feed, confirmed in code.** It ran only when the reference loop finished without stopping, and the loop always had more than a hundred counts pending.
- **Signatures and watched repositories, inferred from timing.** On November 8 each ended about two seconds after it started, one pacing gap after the previous search request, which fits a refusal on the first request. Whether GitHub's primary window or a secondary limit applies is unknown; the heavier reference queries were new in the release. A refused repository also lost its turn in the watched rotation.
- **Permanent partial, confirmed in code; the Bluesky stop reason is inferred.** Bluesky samples ended at 247 to 287 frames in under eight seconds, which fits the 256 KiB byte budget being reached before the 300-frame bound; the code treated that as a failed scope. The registry scan reported partial until a full pass completed, which takes weeks at 20 entries a run. Moltbook's walk has reached its 6,000-post ceiling every day since November 1.

**Lesson:** a status that is amber every day hides the day something breaks, and an outcome without a reason sends the next reader to the database. Give optional work a bound and the lowest priority, test validators against real publisher responses rather than empty fixtures, and after a release compare each source's newest stored timestamp with the run time instead of trusting that the run happened.

**Follow-up:** read `/data` after the first deployed run; see [R7](roadmap.md#r7-give-the-github-jobs-enough-time) and [R8](roadmap.md#r8-moltbook-volume-exceeds-the-walk-cap).

For new incidents, add impact, dated evidence, confirmed cause or explicit unknown, fix/PR, verification and follow-up. Avoid copying raw headers, connection details, mail or credentials.
