# Project status

Verified September 11, 2026 against GitHub `main` at `2885369` and the matching local source. Recheck before relying on service settings or production freshness.

## Current product

External internet evidence only: left navigation, Agents to destinations animation, multi-year line reports and a GitHub calendar heatmap. Detailed analysis remains on source pages. Local visit dashboards are retired. `/demo` is synthetic; an offline observed page does not silently substitute demo data. See [accepted decisions](decisions.md).

## Verified state

| Area | Evidence and limits |
|---|---|
| GitHub | [PR #7](https://github.com/eshin087/gcdtracker/pull/7) merged at `2026-09-10T04:10:00Z`; merge commit `2885369` is current remote main at this check |
| Automation | GitHub API reports Actions disabled, zero artifacts and zero caches; merged source has no workflow definitions |
| Routine collection | [vercel.json](../vercel.json) configures one daily `/api/ingest/all` invocation. Configuration alone does not prove a successful scheduled run |
| Historical workers | GH Archive, Common Crawl robots census and ai.robots.txt history have no scheduled workers. Their receive/status handlers and stored datasets remain |
| Hosting plan | Authenticated read-only check reports Vercel Hobby. This is a dated setting, not a permanent cost guarantee |
| Database plan | Neon account billing plan was not independently verified. A database connection cannot establish billing plan or remaining allowance |
| Public health snapshot | `/api/live` returned `db: true`, `status: stale`, `lastIngest: 2026-09-10T03:49:44.11Z`, and `generatedAt: 2026-09-10T04:10:21.711Z`. Several sources reported partial outcomes. This returned snapshot is not proof of present database connectivity or current source coverage |
| Production release | Exact active deployment commit and migration state were not inspected during this documentation task |

## Follow-ups

- [R1](roadmap.md#r1-align-health-with-the-daily-schedule): health defaults still expect a routine run every 30 minutes, and retired historical workers still participate in freshness. The public snapshot also needs a fresh deployment/cache check before interpreting it as current.
- [R2](roadmap.md#r2-prune-detail-without-losing-historical-summaries): owner confirmed pruning older detail while preserving summaries. Existing retention covers only six tables; implement further pruning only after proving the required summaries survive.
- [R3](roadmap.md#r3-close-cost-and-runtime-verification-gaps): verify Neon plan and effective deployed collection runtime before forecasting capacity or claiming unconditional zero cost.

## Documentation handoff

This task adds a project handbook, four project skills and startup guidance. It changes no application behavior, retention settings, database schema or scheduler. See the branch/PR for documentation validation; prior application test counts are historical evidence, not tests rerun for these documents.

At the next material handoff, replace this snapshot with the newly verified state. Move lasting choices to [decisions](decisions.md) and keep unresolved work in [roadmap](roadmap.md); avoid accumulating session-by-session logs here.
