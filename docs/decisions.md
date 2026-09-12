# Accepted project decisions

Captured September 11, 2026 from the owner's requests in this project. Earlier choices are recorded by capture date rather than assigning an unverified decision date. These are current project intent; later explicit instructions can supersede them.

## D1: Measure external public internet activity

The site focuses on external crawler traffic and agent activity. Remove dashboards and collection specifically about visitors to gcdTracker. Existing compatibility endpoints and historical tables are not a reason to restore local visitor analytics. The September 7 audit's recommendation to keep Visitors as an evidence explorer is superseded.

## D2: Preserve the distinctive homepage

Keep the left navigation and original Agents to destinations dashboard/animation. Keep the multi-year line graph reports and daily GitHub heatmap; do not replace them with homepage bar-chart summaries. Add useful provenance and coverage metadata without presenting animated dots as individual live internet requests. The earlier compact-homepage recommendation is superseded; its old performance measurements do not describe this design.

## D3: Evidence must remain interpretable

The observatory samples public sources, not a representative census of the entire internet. Do not invent a percentage of internet activity covered. Keep units, source, observation window, coverage, methodology version and attribution limits attached to metrics. Missing is not zero; platform automation is not necessarily AI; source evidence is required for model-level attribution. Preserve incompatible historical definitions separately. See [data contracts](data-contracts.md).

## D4: GitHub hosts source files only

The owner does not want to spend money on GitHub. Actions was disabled and its workflows and workers removed in [PR #7](https://github.com/eshin087/gcdtracker/pull/7). Do not restore Actions, upload test artifacts, add paid runner infrastructure or silently move the historical jobs to a paid alternative. Run QA locally. Vercel Git integration is separate from GitHub Actions.

## D5: Stay within free service allowances

Use the existing Vercel/Neon architecture within free allowances. A cost review must verify actual provider plans and applicable limits; code inspection cannot promise zero bills. Prefer bounded collection, caching and retention over upgrades. Do not enable paid plans, trials or add-ons as an incidental fix. See [cost controls](cost-controls.md).

## D6: Remove older detail and preserve summaries

Explicitly confirmed September 11, 2026: when free capacity is constrained, prefer deleting older detailed records while preserving historical summaries. This is the design direction, not an instruction to delete data during unrelated work. Before changing retention, identify which metrics depend on detail, persist and verify their summaries, preserve coverage/version metadata, and bound cleanup. Existing `wiki_daily`, for example, is platform activity and is not a rollup of the flagged records in `wiki_edits`. See [current retention](data-contracts.md#retention).

## D7: Preview, deployment and migration are separate

Keep previews isolated through `PREVIEW_DATABASE_URL`; show an explicit offline state without it. Keep `/demo` synthetic. A merged PR does not prove that Vercel serves that commit or that migrations were applied. Check current authorization for each external mutation; do not require repeat approval for actions the owner has already authorized in the active task. See [operations](operations.md).

## D8: Public repository hygiene

The repository name is `gcdtracker`. Public README and operational notes may explain architecture and environment variable names, but must not contain credentials, private account identifiers, production connection details, private request evidence or bypass URLs. Do not rename an external provider resource solely because an old internal label remains; confirm its linkage and scope first.

## Unresolved decisions

- Exact raw-record retention windows and storage headroom thresholds beyond today's implementation.
- A free, bounded replacement for historical archive workers, if their freshness becomes a priority; no replacement is scheduled or approved by this document.
- Which sources or research features to add after the accepted Radar/Bluesky/Mastodon pilot. Broader additions still require coverage and cost review.

## D9: Separate AI reading from social publishing

Accepted September 11, 2026: start with Cloudflare Radar, Bluesky and selected public Mastodon servers. Reading traffic and posting evidence have separate reports and denominators. Initial social collection is one bounded daily observation per platform, not a continuous archive or a census. English disclosure text matches are unverified; self-designated bot accounts are separate and are not necessarily AI. Store aggregates and coverage only. Preserve the existing navigation, animation and historical reports.
