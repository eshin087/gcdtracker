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

## Reading and social publishing samples (version 1)

The `crawl-purpose` Radar group adds `radar-v2 / crawl-purpose:<category>` values and metadata at `radar:crawl-purpose`. It requests the previous 28 completed UTC dates with daily PERCENTAGE normalization. These are shares of Cloudflare-observed AI crawler traffic by source-assigned purpose, not request totals or growth. The whole group is replaced atomically; null/absent days remain gaps. A separate `radar-attempt:crawl-purpose` checkpoint permits at most one upstream request per UTC day, including failed attempts. Previous usable values survive failure. Publisher confidence annotations, actual windows and expected/observed days remain in the public Radar JSON.

`bluesky` and `mastodon` store only `social_samples` summaries with version 1. The primary key is platform, UTC sampling-attempt date and version. `social:<platform>:v1` reserves that day before any network access using a transaction/revision guard. The aggregate and completion state commit together; a crash or failure does not authorize another same-day sample. No usable sample means no row, not a zero count. Earlier summaries survive and have no raw-detail retention job.

- Bluesky: one live-tip Jetstream v2 connection; maximum eight seconds, 300 frames, 256 KiB decoded processing and 64 KiB per accepted frame. Only original `app.bsky.feed.post` create events are eligible. Updates, deletes and replies are excluded. Relay resynchronization may surface old content; this measures observed create events rather than a current inventory or posts authored that day. No requested archive replay, reconnect or profile lookups.
- Mastodon: one local public timeline page from each of `mastodon.world` and `fosstodon.org`, at most 40 entries each, six seconds across parallel requests, and 256 KiB decoded per response. Public originals only; no replies or boosts. Selection is biased, including a technology-focused community. Snapshots can overlap across dates, so summing daily rows is not a unique-post count.
- Disclosure: narrow English first-person/content disclosure text patterns, versioned in [social-contract.ts](../src/lib/social-contract.ts). False claims, quotes and missed disclosures remain possible. Matching a tool name in such a signal does not attribute a model.
- Automation: Mastodon's self-designated account bot flag, including conventional scripts. It can overlap with disclosure matches. Bluesky bot status is unmeasured and is exported as null, not observed zero.
- Dates are sampling-attempt dates; actual local observation times and publisher event/post timestamp spans are separate. Caps constrain processing; network overhead and the final frame/chunk may exceed decoded-byte budgets.

Public `/api/export/social_samples.json` contains the last 28 UTC sample dates, aggregate counters and a nested field allowlist. It never contains post text, usernames, IDs, media, private state or cursors. Missing, unavailable, partial and observed-zero signals remain distinct. It is not an estimate of social-platform or internet AI prevalence.

Official contracts: [Jetstream v2 lexicon](https://github.com/bluesky-social/jetstream/blob/main/lexicons/network/bsky/jetstream/subscribeEvents.json), [Mastodon public timelines](https://docs.joinmastodon.org/methods/timelines/), [Radar purpose time series](https://developers.cloudflare.com/api/resources/radar/subresources/ai/subresources/bots/methods/timeseries_groups/).
