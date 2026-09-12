# Data contracts and retention

Reviewed against `2885369` on September 11, 2026. The [schema](../src/lib/db/schema.ts), [collector registry](../src/app/api/ingest/[source]/route.ts) and source implementations define behavior. Update this guide when those contracts change.

## Collection and interpretation

Vercel's daily `all` route attempts the enabled routine sources within a shared deadline. An attempt is not a completeness guarantee. GH Archive, robots census and ai.robots.txt history are outside `all`; their scheduled workers were retired. Source IDs identify collectors, not necessarily a one-to-one mapping to database tables.

| Source family | Storage and progress | Measurement boundary |
|---|---|---|
| Radar (`radar`) | `external_series` with source `radar-v2`; metadata at `collector_state` keys `radar:*` | Publisher-observed traffic and normalized windows. Replace complete group windows; preserve units and normalization, never relabel as raw requests |
| Robots census (`robots-census`, historical) | `external_series` source `cc-robots-v2`; legacy `cc-robots` remains separate | Explicit named-token full-block directives in sampled robots files. Merge matching groups; wildcard separate. Not a complete policy evaluator or proof of behavior |
| GH Archive (`gharchive`, historical) | `gh_archive_hourly`, `gh_archive_daily`, `gh_archive_completed` | Validated hour replacement is atomic, including removal of obsolete keys and affected daily rollups. Version-2 completion markers gate comparable periods |
| GitHub search (`github`) | `github_daily`, sampled `github_events`; `final` and fetched timestamps | Documented accounts and branch signals can overlap. `incomplete_results` or rate limits cannot finalize zero observations |
| Watched repositories (`watched`, `github-signatures`, `agentwatch`) | `watched_repos`, `watched_prs`, `watched_signals`, related series; native watched progress at `watched:*` | Selected repositories and explicit/self-disclosed evidence; imported and native collectors have different coverage |
| Wikipedia (`wikipedia`) | `wiki_edits` | Platform filters versus heuristic tiers remain distinct; flags do not prove authorship |
| Wikimedia (`wikimedia`) | `wiki_daily`, `wikidata_bot_edits`, `commons_ai_uploads`, `wiki_tag_watch` | General bot activity is not necessarily AI. The historical Commons table name does not change the public metric: files added to tracked AI categories, excluding non-file entries |
| OpenStreetMap (`osm`) | `osm_changesets`, versioned `osm_daily`, `osm_sample_seen` | Version 2 uses a capped, overlapping 48-hour creation-time sample. Dedup IDs and daily counters commit together; legacy version 1 stays separate |
| MCP registry (`mcp`) | `mcp_servers`, `collector_state` key `mcp` | Fixed sync boundary, opaque cursor, guarded updates and deletion status. Initial version-2 synchronization must finish before current totals are represented as complete |
| Packages (`packages`) | `external_series` sources `npm`/`pypi`; `package:*` and `packages:rotation` state | Downloads measure distribution, not executions, users or AI requests. Each package resumes independently |
| Context (`baseline`, `botcommits`) | `external_series`; baseline progress at `baseline:*` | Preserve upstream units, periods and quoted definitions. Temporal correlation with model launches is not causal evidence |
| Forums (`moltbook`) | `forum_posts`, `forum_daily` | Platform-reported public activity, not independent proof of autonomous model behavior |
| Identity/catalog (`ipranges`, local catalogs, historical `ai-robots-history`) | `ip_ranges`, `agent_sightings`, `data/` | Published network ranges and listed tokens are evidence with limited scope. Signature-directory membership is not verification of a request signature |

## Progress, time and public output

`success`, `partial`, `failed` and `disabled` are distinct outcomes. Read the report, not just HTTP status: resumable partial work can return HTTP 200. `ingest_runs` is a short-lived operational log; durable checkpoints in `collector_state` must survive its cleanup. Some older collectors still infer progress from stored records or run cursors; inspect the actual source before assuming a durable state key exists.

The checkpoint helper acquires an advisory lock in a separate statement before guarded writes and the revision update in one transaction. A stale revision commits no data. Fetch upstream data outside the database lock. Do not advance a checkpoint before its observations commit.

Use completed UTC calendar windows. Keep absent, observed-zero and partial periods distinguishable; preserve chart gaps and comparable heatmap scales. Ratios need compatible numerator/denominator coverage. A successful collector result does not establish whole-platform or whole-web completeness.

Public contracts live in [export columns](../src/lib/export-columns.ts), [public evidence](../src/lib/public-evidence.ts), [Radar metadata](../src/lib/public-radar.ts), [CSV handling](../src/lib/csv.ts), and the [export route](../src/app/api/export/[name]/route.ts). Do not serialize whole database rows or collector-state objects. Signature status is `absent` or `unverified`; deprecated `signed` only denotes header presence. Network prefixes, hashes, raw request headers and trap tokens stay out of public responses. See [changelog](../CHANGELOG.md) for compatibility details.

## Retention

The owner prefers pruning old detail while keeping historical summaries. Current [retention code](../src/lib/ingest/retention.ts) implements these UTC-date cutoffs; they are not newly selected durations:

| Table | Current cutoff | Preservation consideration |
|---|---|---|
| `visits` | 180 days | Retired local-visit detail; `traffic_daily` survives separately |
| `wiki_edits` | 180 days | `wiki_daily` is a different platform-level metric, not a replacement for historical flagged-edit counts |
| `github_events` | 90 days | `github_daily` survives; detailed examples can expire |
| `forum_posts` | 180 days | `forum_daily` survives; confirm which future metrics need post detail |
| `ingest_runs` | 30 days | Durable checkpoints survive; some unscheduled sources can disappear from latest-run views |
| `osm_sample_seen` | 7 days | Must outlast the overlapping sample window to prevent retry inflation |

Cleanup uses batches of at most 1,000 records and at most 50 batches per job, with a deadline check. A configured window does not guarantee records have expired if retention has not completed. Other tables have no rule in this job, including watched PRs/signals, OSM changesets, Wikidata detail, Commons records and legacy guestbook notes.

Daily series, methodology metadata, checkpoints and archive completion markers are not deleted by this retention job. That does not mean all raw evidence is retained indefinitely or that every future summary already exists. Before extending cleanup, test that required historical charts and denominators remain unchanged after detail is removed; keep version and coverage metadata with the retained summaries. After a PostgreSQL delete, reusable space and provider-billed storage may differ, so measure actual allowance usage rather than promising immediate shrinkage.
