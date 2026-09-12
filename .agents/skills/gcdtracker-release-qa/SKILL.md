---
name: gcdtracker-release-qa
description: Validate gcdTracker changes locally, prepare a reviewable PR, or diagnose Vercel preview and production differences. Includes its dashboard, isolated database and public-export regression requirements without GitHub Actions.
---

# gcdTracker release and QA

Use [QA](../../../docs/qa.md) for executable setup and [operations](../../../docs/operations.md) for migration/rollback. Read [decisions](../../../docs/decisions.md) before altering UI or scheduling. Run commands from the repository root.

## Establish the revision and scope

Inspect the working tree, base branch and relevant PR state. Use a `codex/` branch for new work. Do not mix another task's edits or assume a prior draft is still open. Keep PR creation, merge, deployment and migration status distinct; use current task authorization rather than inferring permission from this skill.

GitHub Actions remains disabled. Run needed checks locally, including an offline production build for application changes. Clear `DATABASE_URL` and `PREVIEW_DATABASE_URL` explicitly in the build process: this checkout can have ignored local credentials, so merely calling a build "offline" does not isolate it.

The baseline application checks are `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. For documentation-only changes, verify links, factual references and public-data hygiene; a full app build is unnecessary. For dependency changes, inspect production and development advisory scope and compatible upgrades; do not force a downgrade solely to silence an audit.

## Choose meaningful regression coverage

Use existing unit tests near the changed code. Use the isolated PostgreSQL/Neon HTTP bridge for transaction, quota, checkpoint and migration changes. Follow the QA guide's separate integration, fixture seeding and browser phases: tests clear their tables and must not run concurrently with seeded browser tests.

For affected interface paths, preserve and exercise:

- Left navigation, Research disclosure, focus return, strict subroutes and legacy redirects.
- Agents to destinations animation and pause/reduced-motion controls; multi-year line views and keyboard-inspectable heatmap.
- Distinct missing/partial/zero observations, stable initial timestamps, no hydration errors and no silent demo fallback.
- Saved bookmarks with malformed storage, consistent IDs and cross-tab updates.
- Public HTML/client props/JSON/CSV allowlists and formula-safe string cells.
- Relevant layouts at 390, 768, 1024 and 1440 pixels, light/dark themes and no page-level horizontal overflow.

When changing chart rendering or data loading, compare identical seeded datasets and document the tested revision, viewport and settings. Do not reuse the September 7 compact-homepage numbers as a measurement of the restored dashboard. Mount only selected views and avoid hidden full historical charts.

## Preview and deliver

A preview uses isolated `PREVIEW_DATABASE_URL`, or is explicitly offline. `/demo` demonstrates synthetic content. Vercel login protection is an access state, not proof the build is broken; do not disable protection globally to share a demo. Diagnose production by matching the alias to a successful deployment and source SHA, then checking migration/collection state.

Prepare a concise PR with the problem, resulting behavior, validation actually performed, data/migration impact and material limitations. Keep credentials, bypass links and private screenshots out of public artifacts. If the task authorizes pushing, push the scoped branch; do not assume it authorizes merging or deploying production. If those actions are already explicitly authorized, do not ask again merely because this skill exists.

After an authorized release, verify the deployed revision and relevant public behavior. A ready deployment can still have stale observations. Update status and the public changelog with evidence and unresolved limitations; do not call local validation a production check.
