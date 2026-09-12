# Project status

Verified September 11, 2026 (local date). Recheck deployed revision, source freshness and billing settings before relying on them.

## Current work

The tested application revision is `18a0ac5`, on `codex/activity-flow-modes`. The first Agents → destinations panel now has Contributions, Social publishing and Web crawling modes. The social heatmap and duplicate homepage source panels are removed; the original GitHub daily heatmap, multi-year lines, left navigation and contribution replay remain.

Each social platform displays its latest individual sample. Disclosure matches and unclassified posts partition that sample; overlapping bot flags remain metadata. Radar uses one complete common date with percentage units and a Cloudflare-observed web destination. The inspector exposes accessible values, sample outcomes, timestamps, coverage and expandable methodology details. Only the selected graph mounts, and the browser receives compact flow summaries.

This update changes presentation only: no collectors, schema, historical rows, dependencies or schedules change.

## Verified state

| Area | Evidence and limits |
|---|---|
| GitHub base | Remote main is `2885369`. [Source PR #9](https://github.com/eshin087/gcdtracker/pull/9) merged into `codex/project-guide` at `5e6f7a6`; [handbook PR #8](https://github.com/eshin087/gcdtracker/pull/8) remains open. The flow update is based on that combined branch |
| Actions | Read-only API check returned disabled; no tracked workflow definitions |
| Social upstreams | Earlier bounded read-only checks succeeded for Jetstream v2 and public timelines on mastodon.world/fosstodon.org. No upstream requests were needed for this presentation update |
| Radar | Live purpose endpoint access remains unverified. A configured token name does not establish a successful API response |
| Production | No production migration, merge or deployment was performed by this task. Underlying social collection still requires migration 0002, deployed code and a successful daily attempt; actual production state was not rechecked here |
| Cost and history | No new scheduler, dependency, collection request or database storage was introduced. GitHub is source hosting only. No historical detail or summary was removed |

## Validation

Lint, TypeScript and all 301 unit tests passed. Seeded and offline production builds passed. The full 32-test browser suite passed; all 19 affected tests passed again after the final accessibility and compact-props changes. Coverage includes main/subroutes, three-mode keyboard navigation, destination reset, pause/reduced motion, missing versus zero, source exports, and light/dark layouts at 390, 768, 1024 and 1440 pixels. No page-level horizontal overflow was found.

The prior 40 integration tests cover the unchanged collection/migration implementation. They were not repeated for this presentation-only change. Browser checks used the existing isolated local QA database; the QA server, bridge and Docker container were stopped afterward. No production connection was used for fixtures.

For identical synthetic `/demo` data at 1440 × 1000 with reduced motion, decoded HTML changed from 314,290 to 245,014 bytes (22.0% less), and DOM elements from 1,397 to 1,265 (9.4% fewer). Both revisions retained the original flow and GitHub heatmap; the newer revision removes 56 social heatmap cells and mounts only the selected activity view. These are local document-size measurements, not deployed latency or Core Web Vitals results.

Screenshots and temporary outputs are ignored under `.qa/`. Public docs retain source links and environment names only.

## Next steps and limitations

- Review the flow branch against `codex/project-guide`; PR #8 is still the outstanding route from the combined source implementation to main. A branch push or preview does not mean production has changed.
- Apply reviewed migration 0002 only as part of an authorized release if it has not already been applied. Verify the production revision, migration state and daily source outcomes separately.
- Verify Radar purpose endpoint permissions in the deployed environment.
- Social samples are short English-signal observations from open sources. Closed platforms and most of each day remain unobserved; one attempt per UTC date is intentional.
- [Health delivery verification](roadmap.md#r1-align-health-with-the-daily-schedule), [retention](roadmap.md#r2-prune-detail-without-losing-historical-summaries) and [billing/runtime verification](roadmap.md#r3-close-cost-and-runtime-verification-gaps) remain open.
