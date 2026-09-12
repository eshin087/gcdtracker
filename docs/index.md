# Project handbook

Start with [status](status.md) for the latest verified state and [decisions](decisions.md) for the owner's intent. This handbook is maintained during project work; it does not poll services or update itself in the background.

| Document | What belongs here | Update when |
|---|---|---|
| [Status](status.md) | Dated revision, PR/deployment evidence, uncertainties and immediate next steps | A material task completes or live state is checked |
| [Decisions](decisions.md) | Accepted product and operating choices, rationale and superseded choices | The owner makes or changes a decision |
| [Executive overview](executive-overview.md) | Purpose, architecture, technology and code ownership | Architecture or dependencies materially change |
| [Data contracts](data-contracts.md) | Source meaning, coverage, versioning, progress and retention | A metric, collector or schema changes |
| [Cost controls](cost-controls.md) | No-cost operating policy and how to verify cost exposure | Scheduling, storage, providers or billing assumptions change |
| [Operations](operations.md) | Release, preview, migration, rollback and bounded repair procedures | An operating procedure changes |
| [QA](qa.md) | Local unit, database and browser validation setup | Test setup or commands change |
| [Roadmap](roadmap.md) | Open work with evidence and completion criteria | A finding is added, prioritized or completed |
| [Incidents](incidents.md) | Symptoms, verified causes, fixes and lessons worth retaining | A consequential incident is investigated |
| [Changelog](../CHANGELOG.md) | Changes to public behavior and contracts | A user-visible change is prepared/released |
| [Historical QA audit](qa-audit.md) | Evidence for the September 7 revision only | Add a correction or supersession note; do not rewrite past measurements |

## Keeping context useful

Keep durable facts in one place and link to them. Reference code rather than copying full schemas, dependency locks or provider manuals. Use `verified`, `reported`, `proposed` or `unknown` where the distinction matters. Include a commit/PR or source file for important claims; a date alone is not proof of deployment.

Put public-safe summaries here. Keep raw logs, screenshots containing account details, database measurements, private incident evidence and temporary outputs in ignored `.qa/` storage or the appropriate private provider console. Do not paste mail, environment values, database URLs, deployment-bypass links, personal paths or account/payment details into these documents.

Small templates for future updates:

- **Status:** verified date and revision; what changed; checks actually run; remote/deployment state; unknowns; next action.
- **Decision:** identifier; date captured; accepted choice; reason; consequence; what it supersedes.
- **Incident:** date; symptom/impact; evidence; confirmed cause or explicit unknown; fix/reference; verification; follow-up.
- **Roadmap item:** problem; evidence; priority; completion criteria; status. Proposed work is not authorization to execute it.

The root [AGENTS.md](../AGENTS.md) is the entry point for coding agents. The four project skills linked there provide focused procedures; ordinary work need not load all four.
