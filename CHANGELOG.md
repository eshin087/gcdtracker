# Changelog

## Unreleased — Project handbook and skills

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
