# Project status

Verified September 11, 2026 (local date). Recheck deployed revision, source freshness and billing settings before relying on them.

## Current work

The tested application revision is `c19a6b7`. The three-source implementation is on `codex/open-social-observatory`, stacked on the still-open [handbook PR #8](https://github.com/eshin087/gcdtracker/pull/8). It adds Cloudflare Radar crawler-purpose share lines, bounded Bluesky/Mastodon publishing samples, a separate social heatmap/report, public coverage metadata and additive migration 0002.

The existing left navigation, Agents to destinations animation, multi-year lines and GitHub heatmap remain. No local-visitor dashboard, paid dependency, GitHub workflow or extra scheduler was added. AI reading and publishing remain separate; social samples do not estimate platform-wide prevalence.

## Verified state

| Area | Evidence and limits |
|---|---|
| GitHub base | Remote main was `2885369`; PR #8 remains open. Implementation branch/PR, merge and deployment are separate states |
| Actions | Read-only API check returned disabled; no tracked workflow definitions |
| Social upstreams | Bounded read-only live checks succeeded for Jetstream v2 and selected public timelines on mastodon.world/fosstodon.org. Raw posts/identifiers were not saved |
| Social selection | mastodon.social and mastodon.online required authentication. The collector uses explicitly public alternatives; no authentication bypass |
| Radar | Production environment-name listing includes a Radar token, but local/Vercel-injected smoke processes received no usable token. Live purpose response and permissions remain unverified; fixture and isolated transaction tests pass |
| Production | No production migration, merge or deployment was performed in this task. New social rows require migration 0002 and a release, then a successful daily attempt |
| Cost | Vercel Hobby was verified earlier September 11; Neon billing plan remains unverified. The new work has fixed request/time/processing limits and at most two summary rows per UTC date/version, not a permanent zero-cost guarantee |
| Historical data | Migration 0002 only adds the social aggregate table/index. Legacy preservation and safe migration reapplication pass against isolated PostgreSQL |

## Validation

TypeScript, lint and 276 unit tests passed. All 40 integration tests passed against the isolated local PostgreSQL/Neon HTTP bridge, including concurrency, atomic replacement and rollback. Offline and seeded production builds passed. The full 31-test browser suite passed, covering main/subroutes, privacy, controls, missing versus zero, reduced motion, and light/dark layouts at 390, 768, 1024 and 1440 pixels. All 18 affected browser tests passed again after final timestamp/axis-label polish. The final offline build also passed; the local QA server, bridge and Docker database were stopped.

Screenshots and temporary outputs are ignored under `.qa/`. Public Markdown file links and focused credential-pattern checks passed. Local bridge checks are not Neon-hosted or deployed-production verification.

## Next steps and limitations

- Apply reviewed migration 0002 only as part of an authorized release; merge/deploy the reviewed code separately and verify the actual production revision and daily source outcomes.
- Verify the Radar token's new endpoint access in the deployed environment. A configured variable is not a successful API response.
- Social observations are short English-signal samples from open sources; closed platforms and most of each day remain unobserved. One attempted sample/day is intentional; failed days remain missing until the next UTC date.
- Daily health cadence and historical unscheduled status are fixed in this branch. [R1](roadmap.md#r1-align-health-with-the-daily-schedule) still needs production cache/delivery verification.
- [Retention work](roadmap.md#r2-prune-detail-without-losing-historical-summaries) and [billing/runtime verification](roadmap.md#r3-close-cost-and-runtime-verification-gaps) remain open. No old detail was pruned.
