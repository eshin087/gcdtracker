# gcdTracker

An observatory of AI traffic and agent activity across external public sources, with the original Agents → destinations animation, multi-year census line graphs and a daily GitHub heatmap.

Each source covers a different part of the internet; counts cannot be added into a whole-internet AI activity total. Source classifications and attribution evidence stay attached to each measurement. Local visitor tracking and dashboards are retired. Historical summaries remain available; some detailed records expire under the [retention policy](docs/data-contracts.md#retention).

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

See the [executive architecture and operations overview](docs/executive-overview.md) for a guided explanation of the system.

For ongoing work, start with the [project handbook](docs/index.md), [verified status](docs/status.md) and [accepted decisions](docs/decisions.md). [AGENTS.md](AGENTS.md) routes coding agents to four project skills for catch-up, data quality, release QA and cost control. These files are maintained during project work; they do not run background automation.

## Development

Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle/Neon HTTP, and Vercel. GitHub is used only for source hosting.

```sh
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

Without a configured database, the site renders an explicit offline state. Use environment-specific credentials and keep production values out of local fixtures, previews, logs, and commits.

See [QA setup](docs/qa.md), [audit and results](docs/qa-audit.md), [migration and bounded repairs](docs/operations.md), and [public interface changes](CHANGELOG.md).

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Production/local Neon connection. |
| `PREVIEW_DATABASE_URL` | Isolated preview connection. Vercel previews ignore `DATABASE_URL` and remain offline without this value. |
| `CRON_SECRET` | Secret used to authorize scheduled ingestion. |
| `IP_HASH_SECRET` | Dedicated secret for privacy-preserving network identifiers. |
| `GITHUB_TOKEN` | Public GitHub read/search access and API limits. |
| `CLOUDFLARE_API_TOKEN` | Optional Radar read access. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL. |

Deployment credentials belong in Vercel environment settings. Never commit environment values or put production connections into QA or preview configuration.

## Collection

GitHub Actions is disabled and this repository contains no workflow definitions. Vercel invokes the routine collector once daily. GH Archive, Common Crawl robots census, and ai.robots.txt history are retained as historical datasets but no longer update automatically.

Collectors expose explicit outcomes and retain durable checkpoints. See the operations documentation before a repair; there is no automatic multi-year reprocessing job.

Pages cache shared summaries for five minutes; the live endpoint refreshes every 30 seconds. Database and Vercel usage depend on traffic and source latency.

## Evidence and privacy

Public HTML, JSON, and CSV use explicit field allowlists. Sensitive network and request details are excluded. Raw IP addresses are not persisted, and saved bookmarks remain in the reader's browser.

A claimed crawler name, branch prefix, edit filter or platform assertion does not prove model authorship. Policy directives do not prove a visitor fetched or understood robots.txt. Radar normalized values retain their scale, units, window and provenance in the JSON export.

## Next research priorities

1. Crawler-purpose trends with comparable periods and coverage.
2. Crawl-to-referral trends, with platform-specific denominators.
3. Coverage timelines marking outages and definition changes.
4. Crawler-policy history separated from observed behavior.

Multi-site measurement and controlled experiments are deferred. A future multi-site implementation should collect server/CDN logs because many crawlers do not execute browser analytics.

## Licences

Code: MIT. Project data exports: CC BY 4.0, subject to underlying source rights. Quoted sources retain their publishers' licences; Radar data has its own licence. Fonts: SIL OFL. Public third-party metadata links to its source; inclusion implies no endorsement or finding of misconduct.

## Security

Do not report suspected vulnerabilities in a public issue. Use [GitHub private vulnerability reporting](https://github.com/eshin087/gcdtracker/security/advisories/new) or contact the repository owner privately. Never include credentials, private request evidence, or production data in a report.
