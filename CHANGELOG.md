# Changelog

## Unreleased - Display and interpretation fixes

- Homepage flow: the Cursor branch-prefix detector is labelled "Cursor branches", so it no longer shares the name "Cursor" with the app account.
- Forums: the daily series ends at the last UTC day a walk has finished counting, and a day without a stored count is a gap in the charts and is listed under them, not drawn as zero. A stored zero stays zero.
- Social publishing: a new table pools every stored sample per platform, giving matches, sampled posts, the rate, and how many of the recent dates have a sample. Missing dates are left out of the totals.
- GitHub: text signatures are a table with the number of days collected in the last 30, the matches on those days, a per-collected-day figure and the latest day, replacing a 30-day sum whose day count was only in a tooltip.
- New agents: the registry column is "Recorded here", with a note that the registry is scanned in batches in catalogue order and publishes no join date. The crawler-token note says which dates come from the list's history and which from this site's first sighting.
- Charts: the multi-year line chart omits its start-year label when it would overlap the first year tick, and heatmap month and weekday labels scale with the map so they no longer render larger than the surrounding text.

## Unreleased - Collector budget, Radar metadata and run reasons

- `/data` shows a short reason under each source's latest result, and `/api/live` adds the same text as `detail` (null when there is nothing to explain). The text is built from fixed phrases, HTTP status codes, UTC times and collector step or repository names; raw error messages are never published. Source names in that table no longer break mid-word on narrow screens.
- Radar stores a snapshot when only a supplementary publisher field fails validation: an annotation, `lastUpdated`, `aggInterval`, a unit entry or the confidence block is left out and named in the run statistics. Normalization and the observation window are still required. In `/api/export/radar.json`, an annotation's `startDate` or `endDate` can now be null for open-ended or instantaneous events.
- The GitHub census run counts the previous UTC day, then takes the sample-feed query, then repairs at most one earlier day from the previous week. It no longer fills 30-day reference gaps, so days before 26 October 2026 keep detector counts without reference counts and stay marked incomplete on the heatmap.
- GitHub search requests follow GitHub's pause headers: `retry-after`, then the window reset when no requests remain, otherwise one minute. A job waits when its remaining time allows and otherwise stops without sending requests. The search timeout is 12 seconds.
- Text-signature counts: the day that just became final is collected first, then older days missing a final count from the previous week, then provisional counts for the previous day, at most twelve queries a run. Final counts are not requested again. The run is partial only when the newly final day is incomplete.
- The daily `all` route runs the GitHub jobs as census, text signatures, watched repositories. A watched repository keeps its turn in the rotation when GitHub refuses the request.
- Bluesky: reaching the 256 KiB decoded-byte budget with usable posts completes the sample, as the frame and time bounds already did; it is no longer recorded as a failed scope and a partial run.
- Agentwatch: a signing-registry scan that checked its bounded batch no longer makes the run partial while the multi-run pass is in progress. A deadline or a concurrent run still does.

## 2026-10-26 - GitHub search census on the homepage

- The homepage headline tiles now report a GitHub search census (version 1): the deduplicated union of 16 tracked agent detectors per completed UTC day and its share of all public PRs opened that day, with the comparable-day count shown. They no longer show the GH Archive figures frozen since 9 September 2026.
- The daily heatmap has a source selector. GitHub search v1 is the default when it has comparable days; GH Archive remains available as labelled history to 9 September 2026. Each source keeps its own color scale and the two are never combined.
- The GitHub collector stores seven reference counts per finalized day in `external_series` source `github-search`: all PRs opened, plus each tracked branch prefix's PRs by any tracked bot account in two disjoint query chunks. Partially collected days are completed first, then yesterday, then the remaining previous 30 days.
- The `/github` "Search API by day" bot-account line no longer includes text-signature phrase matches.

## 2026-10-26 - Collector accuracy and outcome fixes

- Wikimedia edit metrics are requested from the day after the last stored day and treat upstream HTTP 404 as publisher lag rather than failure; the Wikidata, Commons and tag-sweep steps no longer abort when the metrics dataset is not loaded yet.
- Wikipedia tier-2 heuristic scanning is a time-spread sample of twelve one-page reads across the previous 24 hours with recorded coverage, replacing a drifting cursor that had fallen more than two weeks behind. The Wikipedia page states the sampling method.
- The signature-registry scan skips and counts unexpected Cloudflare catalog slugs instead of failing the whole agentwatch run.
- The GitHub search collector finalizes the previous UTC day first, then takes one rotating sample-feed query, then fills gaps; it no longer counts the current day provisionally, and the by-day series ends at the last complete day.
- Moltbook counts come from a daily walk of the public feed back to the previous run, up to 6,000 posts, with durable coverage state and explicit lower-bound days; only a 200-post sample per run is stored. Flow and page totals read `forum_daily`.
- Radar reports partial only for absent observations or missing purpose days; a publisher-reported non-finite ratio stays in metadata.
- The OpenStreetMap sample takes one page from each of eight equal creation-time slots across the 48-hour window instead of the newest 800 changesets, and a completed capped sample reports success. Maps and Forums pages explain the sampling.
- The daily `all` route runs the feed walk and retention before the paced GitHub jobs and reserves time for jobs still queued.

## 2026-10-26 — AI reading and social publishing

- Added crawler-purpose share lines from a bounded 28-day Cloudflare Radar snapshot, preserving units, normalization, confidence metadata and missing-day gaps.
- Added Bluesky and Mastodon publishing reports. Narrow English disclosure text signals and self-designated bot accounts are distinct; no model authorship or whole-platform prevalence is inferred.
- The first Agents → destinations animation now has Contributions, Social publishing and Web crawling modes. Replaced the social heatmap with sample flows; the original GitHub heatmap and multi-year lines remain. Removed duplicate homepage reports while keeping detailed crawler history on Traffic.
- Social flows partition each platform's latest sample into disclosure matches and unclassified posts; overlapping bot flags remain inspector metadata. Crawling flows use one complete common Radar date with percentage units. Zero-valued paths have no animated dots, and missing sources remain explicit.
- Added aggregate-only daily samples with durable once-per-day attempt limits, atomic completion, explicit failure/partial outcomes and no raw posts/media/identifiers retained. Existing history is preserved by additive migration 0002.
- Added `/social` and `/api/export/social_samples.json`; kept the left navigation, animation, historical lines and GitHub heatmap. Demo data remains explicitly synthetic.
- Aligned health checks with daily collection and marked retired historical workers unscheduled. GitHub Actions remains disabled; no new dependency or scheduler was added.


## 2026-10-26 — Project handbook and skills

- Added a maintained project status, accepted decision record, data/retention contracts, cost controls, roadmap and incident notes, with an index and agent startup guidance.
- Added four project-local skills for catch-up, data-quality work, release QA and cost reviews. Provider-installed skills remain outside Git.
- Recorded the preference to prune older detail while preserving historical summaries; clarified existing retention and labelled the earlier QA audit as historical. This documentation change does not alter retention, collection or application behavior.

## 2026-09-09 — GitHub source hosting only

- GitHub Actions is disabled and all workflow definitions, runner-only scripts, Actions secrets, variables, caches, and artifacts are removed.
- Vercel remains the only automatic scheduler and invokes routine collection once daily. Worker-backed GH Archive, Common Crawl robots census, and ai.robots.txt history remain available as historical snapshots but no longer update automatically.
- Quality checks remain runnable locally and are not uploaded by the repository.

## Unreleased — Internet activity homepage

- Restored the left section-navigation menu and retained the animated Agents → destinations dashboard.
- Restored the original multi-year census using line graphs for Wikimedia, GitHub and crawler policies; removed homepage bar charts. Full stored history is retained instead of a two-year display cap.
- Added a daily GitHub heatmap with year selection and mouse/keyboard inspection. Missing, zero and incomplete observations remain distinct; color scales stay comparable across years.
- Retired local visitor dashboards and request tracking. Visitors routes redirect to Traffic; the forum guestbook view redirects to Forums. Stored history is untouched by this change.
- Removed local visitor statistics from agent profiles, the directory, latest records, data listings and health responses. `GET /api/live` no longer returns `aiVisits24h` or `lastAiVisit`.
- Legacy exports and the hardened guestbook API remain available for compatibility. Preview examples are explicitly synthetic; observed pages never silently use them.

## Unreleased — QA and data-integrity hardening

### Public evidence and APIs

- Visitor exports and pages omit network prefixes, IP hashes, raw user agents, referrers and Signature-Agent values. Paths are normalized to route buckets; arbitrary path identifiers and trap tokens are not published.
- Signature headers are recorded as an unverified observation. `signatureStatus` in JSON and `signature_status` in CSV are `absent` or `unverified`. The existing `signed` boolean remains a deprecated alias for presence of all three headers; it has never meant cryptographic verification.
- Header presence no longer creates an AI identity or admits a guestbook post. Historical synthetic signature identities are masked publicly and are not presented as named verified agents. Existing historical aggregates are retained; the Methods page explains the classifier boundary.
- The visitor CSV deliberately removes `ip_prefix`, `ua`, `referer`, `signature_agent` and `trap_token`; the latter is replaced by `trap_placement`. Consumers must select columns by name. Existing exporter URLs and JSON envelopes remain available.
- Public dataset exports now select fields explicitly and retain header rows when empty. OSM exports include `collectionVersion`; MCP exports include `syncVersion` and `status`, making legacy and current methodologies distinguishable.
- `GET /api/export/radar.json` provides the current `radar-v2` points and each group's normalization, units, observation window, source update timestamp and retrieval timestamp. `external_series.csv` links to this contract with an HTTP `Link` header. A normalized value is not automatically a percentage or request count.

### Security and reliability

- Guestbook writes require a catalogued AI user-agent category, a valid client network and a configured private hash secret. Their one-note-per-network-per-hour and 50-note-per-day rolling limits are enforced in one transaction.
- Missing database/client identity/secret and database-write failures fail closed. Quota responses include `Retry-After`; JSON bodies are bounded before parsing.
- Equivalent IP spellings share the same identity. No predictable fallback hash salt is used; deployment details remain private.
- CSV string cells are protected against spreadsheet formula execution. Baseline framing, content-type, referrer and browser-permission headers are set.
- Additive collector migrations preserve legacy observations, and new methodology versions remain identifiable. Unit tests, real PostgreSQL concurrency/migration tests and seeded browser QA provide repeatable local checks. The pull-request CI workflow added during hardening was subsequently removed with GitHub Actions on September 9.

See [QA procedures](docs/qa.md) for local commands and the limits of the test environment.
