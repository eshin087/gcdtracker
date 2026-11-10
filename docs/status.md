# Project status

Verified November 9, 2026, 02:10 to 04:15 UTC, from the public site, its exports, the GitHub CLI and local checks. Recheck deployed revision, source freshness and billing settings before relying on them.

## Current work

Branch `codex/collector-budget-and-radar`, cut from `origin/main` at `864f4f0`, holds fixes for the collector problems found on November 9. It is open as [PR #15](https://github.com/eshin087/gcdtracker/pull/15), not merged and not deployed. It needs no migration and adds no scheduler, dependency or paid service. See the [incident note](incidents.md#collectors-starved-or-failing-after-the-october-26-release) for the evidence and the [changelog](../CHANGELOG.md) for behaviour.

- Radar accepts a snapshot when only a supplementary publisher field (an annotation, `lastUpdated`, `aggInterval`, a unit entry or the confidence block) fails validation, and records what it left out.
- `/data` and `/api/live` show a short reason for each source's latest run, built from fixed phrases only.
- The GitHub census counts the previous day, then takes the sample feed, then repairs at most one earlier day from the last week. It no longer fills 30-day reference gaps. The three GitHub jobs honour GitHub's own pause headers and run census, signatures, watched.
- Bluesky's byte budget and an in-progress signing-registry scan no longer mark a run partial.

Branch `codex/display-fixes`, cut from the tip of that branch (`5adf80c`), holds the presentation fixes of [R9](roadmap.md#r9-presentation-and-interpretation-fixes). It is open as [PR #16](https://github.com/eshin087/gcdtracker/pull/16), not merged and not deployed. It depends on PR #15, whose commits appear in its diff until that merges, and needs no migration, scheduler, dependency or paid service.

- The homepage flow labels the Cursor branch-prefix detector "Cursor branches", so no two rows share a name.
- Forums ends at the last UTC day a walk finished counting and leaves a gap, not a zero, for a day without a stored count.
- Social publishing adds a table pooling all stored samples per platform, with the sampled-post total and the dates covered.
- The GitHub text-signature list is a table showing how many of the last 30 days were collected beside each total.
- New agents labels registry dates "Recorded here" and explains the batched catalogue-order scan.
- The census chart drops its start-year label when it would touch the first year tick, and heatmap month and weekday labels are sized to the map so they render near the surrounding text.

## Verified state

| Area | Evidence and limits |
|---|---|
| Production | `gcdtracker.vercel.app` returned 200 on 22 routes and exports (and 307 on `/visitors`) with no browser console errors on the homepage or Traffic. It shows the PR #14 behaviour: homepage tiles and the default heatmap read the GitHub search census. The deployed SHA was not read from Vercel. `/github` is still 1.8 MB |
| GitHub base | `origin/main` is `864f4f0` (PR #14 merge). `gh pr list` shows no open pull requests, so PRs #8 and #3 are closed. Local `main` was still at a September 7 commit |
| Actions | Read-only API check: disabled; no workflow directory |
| Production health | The daily run completed on November 8 at about 03:00 to 03:03 UTC. `/api/live` reported `degraded`: radar failed; agentwatch, bluesky, github, github-signatures, moltbook and watched partial; the other ten success. The first request returned a snapshot generated October 26 with every `stale` flag false; the next was current |
| Radar | Every stored group was last fetched October 25, 03:47 UTC, the last run before the release, and `crawl-purpose` has never been stored. The homepage Web crawling mode is empty and Traffic shows "stale snapshot". The same Cloudflare token recorded signing-registry entries on eleven dates from October 27 to November 8, so the token works. The stored failure message was not read |
| GitHub search | Comparable census days are October 26 to November 7, one per run. Reference backfill reached only September 27, October 1 and October 9, two of seven counts each. `github_events` has 0 rows. Text-signature counts were last collected November 1 and before that October 26; watched pull requests were last observed on the same two dates |
| Other sources | Wikimedia, Wikipedia and OSM now succeed. Moltbook daily counts were between 5,726 and 6,150 on November 1 to 7, the walk's 6,000-post ceiling, and Forums marks them as lower bounds. All 13 Bluesky samples since October 27 are partial, each ending at 247 to 287 frames in under eight seconds, short of both the 300-frame and the time bound. Social disclosure matches: 0 of 2,913 sampled posts |
| Historical or lagging by design | GH Archive daily ends September 9 and the robots census August 7. Hugging Face agent usage ends September 30; the publisher's dataset was last modified October 5 |
| Database and cost | Not measured in this review: a read-only database query was not permitted from the agent session. Vercel and Neon plan tiers were not re-verified |

## Validation

On the branch: lint, TypeScript and all 377 unit tests in 39 files passed, including new cases for Radar metadata, the run-detail vocabulary, GitHub pacing and pauses, census and signature work order, watched rotation, the Bluesky byte bound and the registry scan outcome. An offline production build passed with `DATABASE_URL` and `PREVIEW_DATABASE_URL` cleared, and its `/data` page rendered the no-database state.

On a fresh disposable PostgreSQL 16 container: `init` and `migration-check` passed, the integration suite passed all 44 tests in 7 files, and the seeded browser suite passed all 33 tests, first on the seeded build and again on the final build. The container was removed afterwards.

The reason line on `/data` was then checked in a browser against synthetic failed and partial runs added to the QA database. It rendered at desktop and 375-pixel widths without horizontal overflow, `/api/live` carried the same text, and a run whose stored error contained a hostname showed only "error: network error". The check also found source names breaking mid-word at phone width, which the branch fixes.

On `codex/display-fixes`: lint, TypeScript and all 383 unit tests in 40 files passed. On a fresh disposable PostgreSQL 16 container, `init` and `migration-check` passed, the integration suite passed all 44 tests in 7 files, and the seeded browser suite passed all 33 tests, first on the seeded build and again on the final build. The container was removed and the build output replaced with an offline build afterwards.

The changed views were then seen in a browser at desktop and 375-pixel widths with the seed plus synthetic rows added to the QA database: two Cursor detectors, three text signatures collected on one or two days, and two removed forum days. The flow showed "Cursor" and "Cursor branches"; Forums named the two gap days; the Social and signature tables showed their totals and day counts and scrolled inside their own frame with no page overflow; New agents showed the renamed column. That check found heatmap labels at about 6 pixels on a phone, where the map keeps its natural width, so the stylesheet now uses the original 10-unit size below 700 pixels: labels measured about 10.6 pixels at 1024 and 10 at 375. The start-year collision case is covered by a unit test only, because the seed starts in January.

Narrow layouts were not checked on production. No production write, migration, merge or deployment was performed, and no production database query was made.

## Next steps and limitations

- After a deployment, read `/data` following the next daily run. The Radar line should name the group and either an HTTP status or the rejected check; the GitHub lines should say whether a pause came from `retry-after` or the window reset. Until then the Radar cause is inferred by elimination, not confirmed.
- If GitHub's refusal is a minute-long `retry-after`, the three GitHub jobs cannot all finish inside one invocation; see [R7](roadmap.md#r7-give-the-github-jobs-enough-time).
- Decide the Moltbook cap ([R8](roadmap.md#r8-moltbook-volume-exceeds-the-walk-cap)).
- Radar purpose endpoint permissions, Neon plan verification, retention ([R2](roadmap.md#r2-prune-detail-without-losing-historical-summaries)) and the GitHub page payload ([R6](roadmap.md#r6-trim-and-cache-the-heavy-explorer-pages)) remain open.
