# QA and hardening audit — 2026-09-07

Scope: implement the approved traffic-first QA plan on `codex/qa-hardening`, targeting `main` at `8822e28f3950f8eb9e342c1989b3bf3bbd485e5b`. No production migration, merge or deployment was performed.

## Confirmed findings and changes

| Finding | Resolution |
|---|---|
| Arbitrary signature headers established trusted AI identity | Signature presence is unverified metadata only; IP verification remains separate; legacy synthetic identities are masked publicly |
| Guestbook check/insert raced under concurrent requests | Transaction-scoped advisory lock followed by a separate READ COMMITTED check/conditional insertion; hidden notes count; Retry-After on quotas |
| Public visitor data leaked network/header evidence | Explicit projections and public DTOs for HTML, JSON and CSV; normalized paths; no raw prefixes, user agents, referrers, signature hosts or trap tokens |
| Spreadsheet formula execution from untrusted strings | Formula-leading text is neutralized while numbers and CSV escaping retain their types |
| Known hash-salt fallback and inconsistent IP forms | Canonical IPv4/IPv6 including mapped addresses; no known fallback secret; invalid referrers discarded |
| Partial collectors looked successful | Explicit success/partial/failed/disabled results, durable checkpoints, failed-source scheduler checks, freshness states |
| MCP pagination and stale updates lost/corrupted records | Fixed sync boundary, saved opaque cursor, timestamp-guarded v2 upserts, deleted status, withheld totals before initial completion |
| OSM retries inflated aggregates | Bounded creation-time overlap, persisted IDs, atomic dedup/counters, separate collection version 2 |
| GH Archive partial replacements corrupted rollups | Transactional hour replacement, day locks, obsolete-key deletion, completion marker after successful commit |
| Independent data sources could starve or prematurely finish | Per-package and per-source progress, bounded watched windows, incomplete-search rejection |
| Robots groups and normalized metrics were misleading | Group merging, versioned explicit named-token directive measure, wildcard separate; Radar whole-window replacement with units and provenance |
| Missing calendar days were treated as comparable periods | Fixed completed UTC weeks, observation coverage, null chart gaps and certified archive-day eligibility |
| Commons counted category/non-file records as uploads | File namespace only; labelled category additions |
| Homepage rendered redundant hidden historical charts | Compact traffic chart and purpose breakdown; detailed charts kept on research pages |
| Sources disclosure, malformed Saved data and route parsing broke navigation | Predictable disclosure/focus, strict routes, validated storage, ID migration and cross-tab synchronization |
| Mobile overflow, excessive fonts and motion | Responsive containment, keyboard behavior, reduced-motion support, two primary font preloads |

Broader authorship and causal claims were corrected in pages, research notes, metadata and llms.txt. The site describes observed evidence and source limitations.

## Measurement

Production baseline audit before changes: 15 main pages loaded, build/lint/type checks and 44 existing tests passed. The production homepage had approximately 1.27 MB decoded HTML and 7,901 DOM elements. Mobile overflow was observed on Github, Data, Maps, New Agents and watched/signals subviews.

The reproducible before/after comparison uses the **same synthetic local database**, 1,001 daily archive periods and 33,880 external-series rows, original main vs this branch, Chromium at 1440 × 1000, light theme, reduced motion, and prefetch headers to avoid recording QA requests. The only original-code adaptation is routing its Neon HTTP transport to the local test bridge.

| Homepage measure | Original main | Repaired | Reduction |
|---|---:|---:|---:|
| Decoded HTML | 1,043,943 bytes | 55,897 bytes | 94.6% |
| DOM elements | 6,652 | 366 | 94.5% |
| Encoded HTML | 95,970 bytes | 10,757 bytes | 88.8% |
| Font preload links | 7 | 2 | 71.4% |

The 60% reduction targets are exceeded. The seeded and live baseline sizes differ because their datasets differ; these are not interchangeable comparisons. TTFB/DCL are single-machine observations and are **not** production Core Web Vitals or Lighthouse scores. No INP claim is made.

## Validation

Local validation: 191 unit tests, 24 PostgreSQL integration tests and all 13 Chromium browser tests pass. The PR records hosted CI results. Validation includes:

- Full lint, TypeScript and unit suite; all-dependency audit; offline production build.
- Real PostgreSQL through the production Neon HTTP/Drizzle driver: concurrent guestbook limits, post-lock visibility, rollback, IP normalization, privacy, collector replay, corrected archive replacement, OSM deduplication and checkpoint CAS.
- An independent original-schema database: legacy row preservation, additive migration application and equivalent second application.
- Seeded production browser build: 31 main/subview routes, 9 invalid routes, navigation click/keyboard/focus, bookmarks/cross-tab storage, HTML/client errors and private-field markers, export contracts.
- Responsive widths 390, 768, 1024 and 1440; light/dark screenshots; reduced motion. No page-level horizontal overflow across the tested pages.
- Original/current homepage measurement script at `tests/browser/measure-home.mjs`.

No production quota tests, write requests, historical replay or database migrations were run. The local fixtures are synthetic; screenshot counts do not describe production.

## Remaining limitations

- Apply the additive migration before data-backed release. See [operations and rollback](operations.md); the old OSM writer is incompatible with the new daily key.
- Actual Neon-hosted concurrency was not exercised. Tests use real PostgreSQL and the production Neon HTTP client via a local protocol bridge; hosted network/proxy behavior may differ.
- Signature verification is intentionally not implemented. No observed signature header implies verified identity or model attribution.
- Historical aggregate traffic can contain earlier classification errors, including header-based attribution. Expired raw rows cannot reconstruct every old counter. No retrospective accuracy is claimed.
- Legacy OSM, robots, Radar and archive data remain preserved with clear methodology boundaries. Corrected coverage starts as collection progresses; gaps are visible.
- Public upstream data is incomplete and definitions may change. A successful run does not prove exhaustive whole-web or whole-platform coverage.
- The automated browser suite covers Chromium and targeted keyboard/contrast/motion behavior; it is not a full assistive-technology or multi-engine certification.
- Dependency audit is a point-in-time advisory check, not proof of absence of vulnerabilities.
- Production deployment, long backfills and new data integrations remain separate decisions.

## Product recommendations

Keep Traffic as the main analysis page and Visitors as its evidence explorer. Keep broader sources in Research and existing URLs intact. The removed homepage historical charts were redundant; their detailed versions remain useful on source pages.

Prioritize purpose-specific crawler trends, crawl-to-referral ratios with explicit denominators, a chart coverage timeline, and operator/purpose policy history. Defer multi-site collection and controlled experiments until attribution, source freshness and existing coverage are dependable.
