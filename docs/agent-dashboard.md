# Agents → destinations dashboard

This draft restores the homepage's original orange source-to-destination paths, moving dots, destination totals and record replay. It builds on QA hardening PR #1 and leaves that PR separate.

## Evidence and interaction

- Destination filters and a keyboard-accessible source selector reveal purpose, attribution evidence, units, observation dates, latest observation, latest collection run and explicit collection outcomes.
- Website request categories show IP-range matches, checkable requests and verification coverage. Signature-header counts are labelled unverified.
- Width and moving-dot density scale within the same feed and unit. Different sources have independent scales; they cannot establish a cross-platform volume ranking.
- Destination totals retain their units. GitHub PR matches may overlap; Wikipedia/Wikidata edits and Commons files stay separate.
- The chart uses 30 completed UTC calendar days. Dates containing rows do not imply continuous collection. The latest-record replay may extend beyond that window and does not indicate live event timing.
- OSM includes only deduplicated collection version 2; Commons includes file additions to tracked categories, excluding non-file entries.
- Pause stops both SVG motion and replay. Reduced-motion preferences stop automatic playback, including before hydration. The original wide diagram scrolls inside its container on small screens.
- Aggregate reads share a five-minute cache. The homepage keeps the compact traffic chart and does not restore duplicated historical charts.

## Demo and deployment

The separate `/demo` page uses fixed, explicitly labelled synthetic data. It demonstrates populated paths, partial and failed collection, declared crawler purposes and IP-check coverage without a database. Its metadata requests no indexing. The observed homepage never silently substitutes sample data.

The new draft PR is stacked on `codex/qa-hardening`. Its Vercel preview includes both the observed homepage and `/demo`. Preview deployment protection remains enabled; a Vercel login may be required. Production is not deployed or modified.

No migration or repair job is required by this follow-up. Reverting its commits restores the compact homepage from PR #1.

## Validation

Local lint, TypeScript, all 195 unit tests and an offline production build pass. Seven browser checks cover the populated offline demo, four responsive widths and light/dark reduced-motion layouts. A direct motion check confirmed that the animated dots move and Pause removes their motion.

Hosted CI runs the complete browser suite and 27 actual PostgreSQL integration tests, including UTC boundaries, private-field exclusion, collection failure and the coding-agent remainder. The local Docker engine could not restart because Windows would not release its stale runtime socket; no production database was used. CI retains seeded homepage measurements and screenshots; the PR description records the final results and any limitations.

## Screenshots

The sample-data demo at 1440 pixels:

![Synthetic dashboard demo at 1440 pixels](qa/dashboard-demo-1440.png)

Dark theme at 390 pixels. The wide diagram scrolls inside its frame:

![Synthetic dashboard demo at 390 pixels](qa/dashboard-demo-dark-390.png)
