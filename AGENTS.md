# Working on gcdTracker

## Start with current context

Read [project status](docs/status.md) and [accepted decisions](docs/decisions.md), then inspect the working tree and relevant source. These documents are dated evidence, not a live monitor. Recheck remote PR, deployment, billing and source-health state when the task depends on it. The user's latest instructions take precedence; flag documentation drift instead of silently treating an old plan as current.

Use the [documentation index](docs/index.md) to load only the references needed for the task. The [2026-09-07 audit](docs/qa-audit.md) describes an earlier revision; its homepage measurements and recommendations are not the current design.

## Product and operational boundaries

- Focus on external public internet evidence. Do not reintroduce analytics dashboards about visitors to this site.
- Preserve the left navigation, Agents to destinations animation, multi-year line reports and daily GitHub heatmap. Synthetic `/demo` data must remain identified as synthetic.
- GitHub is source hosting only. Keep Actions disabled and do not add workflow definitions or move retired workers onto another paid service to fill chart gaps.
- Preserve historical summaries and methodology boundaries. The owner's retention preference is to prune older detail; this does not authorize arbitrary deletion or establish that every detail table already has an equivalent summary.
- Keep public docs, code and fixtures free of credentials, private account identifiers, connection strings and raw production evidence. Environment variable names and public source links are sufficient.

## Project skills

Skills live under `.agents/skills/`; open the matching `SKILL.md` when its workflow is relevant:

| Skill | Use for |
|---|---|
| [gcdtracker-context](.agents/skills/gcdtracker-context/SKILL.md) | Resume work after a restart, prepare a handoff, update project context |
| [gcdtracker-data-quality](.agents/skills/gcdtracker-data-quality/SKILL.md) | Diagnose missing/stale data or change collectors, metrics and attribution |
| [gcdtracker-release-qa](.agents/skills/gcdtracker-release-qa/SKILL.md) | Validate changes, prepare a PR, diagnose preview/production differences |
| [gcdtracker-cost-control](.agents/skills/gcdtracker-cost-control/SKILL.md) | Review costs, growth, retention and accidental automation |

Provider skills may also exist locally and are intentionally ignored by Git. Do not commit them just to publish the project skills. A skill describes a workflow; it does not confer permission to change billing, migrate production, merge or deploy.

## Validation and handoff

Use [local QA](docs/qa.md) for executable commands and [operations](docs/operations.md) for migrations and rollback. Run checks appropriate to the change locally; do not restore GitHub CI. Database fixtures and concurrency tests use isolated QA databases, never production. Documentation-only changes need reference, factual and privacy checks rather than a full application rebuild.

At the end of material work, update the affected documentation rather than adding a transcript: status for verified state and next steps, decisions for accepted choices, roadmap for open work, incidents for failures with reusable lessons, changelog for public behavior. Record verification dates and limitations. Keep branch, PR, merge, deployment and migration status distinct. Do not imply that a pushed commit is live.
