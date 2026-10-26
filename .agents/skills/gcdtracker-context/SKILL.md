---
name: gcdtracker-context
description: Resume gcdTracker work after a restart, prepare a project handoff, or maintain its status and decision records. Use for project catch-up and documentation upkeep, not unrelated repositories.
---

# gcdTracker context

Establish what is true now without losing the owner's prior choices. Run commands from the repository root; this skill is project-local.

## Resume

Read [status](../../../docs/status.md) and [decisions](../../../docs/decisions.md), then inspect `git status --short --branch` and recent commits. Compare relevant source before adopting a note as current fact. Do not overwrite uncommitted work or switch branches until its ownership is understood.

Use the [handbook index](../../../docs/index.md) to choose further reading. Use the executive overview for architecture, data contracts for measurement, and operations for release/preview diagnosis. The September 7 audit describes an older homepage and retired CI; do not revive its superseded product recommendations.

When remote state matters, check the specific PR's state, remote main SHA and active Vercel deployment separately. A local branch, merged PR, production alias and applied database migration are four different facts. If only one is known, say which one. A stale note or earlier approval failure does not establish today's remote state or override later authorization.

Keep these prior choices in view: external evidence rather than site-visitor metrics; left navigation, animation, multi-year lines and heatmap; GitHub source hosting only; old detail may be pruned while historical summaries survive. The decision record supplies their rationale and limits.

## Maintain context

Update only the canonical document affected by new evidence:

- Status: dated, verified state; revision; remaining uncertainty and next action.
- Decisions: an accepted change of direction and what it supersedes. Do not promote a suggestion to an accepted choice.
- Roadmap: an open problem with evidence and completion criteria.
- Incidents: verified cause/fix or explicit unknown, with a reusable lesson.
- Changelog: public behavior or contract changes, not a tool transcript.

Keep architecture in the existing executive overview; avoid creating another competing overview. Replace transient status instead of appending an unbounded session log. Link to PRs/source rather than copying code, full dependency lists or private outputs. This skill creates no scheduled monitor and does not update personal/global memory.

## Check the handoff

Verify local links, code paths and commands. Distinguish tests run on this revision from historical test counts. Review the diff for secret values, private account IDs, personal paths, raw logs and speculative claims. Report what changed, what was verified and what remains unknown. A documentation refresh does not authorize production changes.
