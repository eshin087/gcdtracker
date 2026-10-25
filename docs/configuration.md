# Configuration and collection

Environment variables, how collection runs, and the open research questions. Moved here from the README so that it stays short.

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Production/local Neon connection. |
| `PREVIEW_DATABASE_URL` | Isolated preview connection. Vercel previews ignore `DATABASE_URL` and remain offline without this value. |
| `CRON_SECRET` | Secret used to authorize scheduled ingestion. |
| `IP_HASH_SECRET` | Dedicated secret for privacy-preserving network identifiers. |
| `GITHUB_TOKEN` | Public GitHub read/search access and API limits. |
| `CLOUDFLARE_API_TOKEN` | Optional Radar read access. |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL. |

Deployment credentials belong in Vercel environment settings. Never commit environment values or put production connections into QA or preview configuration. Without a configured database, the site renders an explicit offline state.

## Collection

GitHub Actions is disabled and this repository contains no workflow definitions. Vercel invokes the routine collector once daily. GH Archive, Common Crawl robots census, and ai.robots.txt history are retained as historical datasets but no longer update automatically.

Collectors expose explicit outcomes and retain durable checkpoints. See [operations.md](operations.md) before a repair; there is no automatic multi-year reprocessing job.

Pages cache shared summaries for five minutes; the live endpoint refreshes every 30 seconds. Database and Vercel usage depend on traffic and source latency.

## Next research priorities

1. Crawler-purpose trends with comparable periods and coverage.
2. Crawl-to-referral trends, with platform-specific denominators.
3. Coverage timelines marking outages and definition changes.
4. Crawler-policy history separated from observed behavior.

Multi-site measurement and controlled experiments are deferred. A future multi-site implementation should collect server/CDN logs because many crawlers do not execute browser analytics.
