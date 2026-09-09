# gcdTracker

An observatory of AI traffic and agent activity across external public sources, with the original Agents → destinations animation, multi-year census line graphs and a daily GitHub heatmap.

Each source covers a different part of the internet; counts cannot be added into a whole-internet AI activity total. Source classifications and attribution evidence stay attached to each measurement. Local visitor tracking and dashboards are retired; existing history is not deleted.

| Area | Evidence |
|---|---|
| Traffic | Cloudflare Radar snapshots and sampled robots.txt policy |
| GitHub | GH Archive observations, documented bot accounts, branch-name signals, watched repositories |
| Wikipedia and Commons | Platform filters, disclosed heuristics, bot activity, files added to tracked AI categories |
| Maps | Capped overlapping OSM creation-time samples with deduplication |
| Forums | Platform-reported public activity on Moltbook |
| Tooling | Package downloads, MCP registry entries, quoted external series |
| Before & After and Notes | Historical context; time correlation does not establish causation |

Legacy Visitors URLs redirect to Traffic; the guestbook view redirects to Forums. Research pages sit under the Research navigation menu; Saved is browser-local.

See the [executive architecture and operations overview](docs/executive-overview.md) for a guided explanation of the system and workflow notifications.

## Development

Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle/Neon HTTP, Vercel, GitHub Actions.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Without a database the site renders an explicit offline state. For a guaranteed offline build, unset or empty `DATABASE_URL` and `PREVIEW_DATABASE_URL`, including values in local environment files. Configured database failures render unavailable/error states.

See [QA setup](docs/qa.md), [audit and results](docs/qa-audit.md), [migration and bounded repairs](docs/operations.md), and [public interface changes](CHANGELOG.md).

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Production/local Neon connection. |
| `PREVIEW_DATABASE_URL` | Isolated preview connection. Vercel previews ignore `DATABASE_URL` and remain offline without this value. |
| `CRON_SECRET` | Ingestion bearer token; optional fallback secret for IP hashing. |
| `IP_HASH_SECRET` | Preferred dedicated IP hashing secret. If neither secret exists, hash-dependent admission fails closed. |
| `GITHUB_TOKEN` | Public GitHub read/search access and API limits. |
| `CLOUDFLARE_API_TOKEN` | Optional Radar read access. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL. |

GitHub Actions uses the repository secret `CRON_SECRET` and variable `SITE_URL`. Do not put production connections into QA or preview configuration. No paid infrastructure is required by this change.

## Collection

The ordinary collector workflow runs every 30 minutes. GH Archive runs every three hours; the robots sample is bounded to one crawl per weekly invocation. The history worker runs monthly. Run logs expire, while durable checkpoints do not. Outcomes are `success`, `partial`, `failed`, and `disabled`; incomplete resumable backfills remain visibly partial.

The protected `/api/ingest/[source]` routes keep their URLs. `all` returns HTTP 500 when an enabled source fails. GH Archive and robots collectors accept validated worker payloads. See operations documentation before a repair; there is no automatic multi-year reprocessing job.

Pages cache shared summaries for five minutes; the live endpoint refreshes every 30 seconds. Actual database/Actions usage depends on traffic, source latency and backfill size.

## Evidence and privacy

Public visitor HTML, JSON and CSV use field allowlists. They exclude IP prefixes/hashes, raw user agents, referrers, signature hosts and trap tokens. Private storage retains limited evidence for abuse prevention and analysis; visits expire after 180 days. Raw IP addresses are not persisted. Guestbook network prefixes remain private for quota enforcement; hiding a note does not remove it from quotas. Saved bookmarks remain in the browser.

A claimed crawler name, branch prefix, edit filter or platform assertion does not prove model authorship. Policy directives do not prove a visitor fetched or understood robots.txt. Radar normalized values retain their scale, units, window and provenance in the JSON export.

## Next research priorities

1. Crawler-purpose trends with comparable periods and coverage.
2. Crawl-to-referral trends, with platform-specific denominators.
3. Coverage timelines marking outages and definition changes.
4. Crawler-policy history separated from observed behavior.

Multi-site measurement and controlled experiments are deferred. A future multi-site implementation should collect server/CDN logs because many crawlers do not execute browser analytics.

## Licences

Code: MIT. Project data exports: CC BY 4.0, subject to underlying source rights. Quoted sources retain their publishers' licences; Radar data has its own licence. Fonts: SIL OFL. Public third-party metadata links to its source; inclusion implies no endorsement or finding of misconduct.
