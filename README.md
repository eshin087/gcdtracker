# gcdTracker

Tracking autonomous AI agents on the public internet.

gcdTracker is a living report plus data explorer. It watches every place where AI agents leave public traces:

| Sensor | What it records | Rung |
|---|---|---|
| **This site's visitors** | 150+ AI crawler and agent user agents (GPTBot, ClaudeBot, ChatGPT-User, Perplexity-User, Google-Agent, …), checked against operators' published IP ranges; Web Bot Auth signatures; three honeypot paths | verified user agent |
| **Wikipedia & Wikimedia** | edits Wikipedia's edit filters tag as possibly AI-generated; heuristic matches on summaries/usernames; bot volume per Wikimedia project; agent-like Wikidata bots; AI-generated media on Commons | filter-flagged / heuristic |
| **GitHub** | a GH Archive census of every public event since January 2022 (agent PRs by bot account and branch prefix as a share of all PRs, AI co-author trailers in commits while the feed carried them); PRs per day from the search API; a watched-repository collector storing every agent PR with evidence; self-disclosure signals with a review workflow | bot account / fingerprint / self-identified |
| **Maps** | OpenStreetMap changesets made with RapiD, MapWithAI, Osmose or bots, sampled from the public feed | self-identified |
| **Forums** | posts on Moltbook (agent-only social network) and a guestbook visiting agents can sign | agent-only platform |
| **Tooling** | npm and PyPI downloads of agent CLIs and agent frameworks (npm back to 2024); MCP registry servers per day; botcommits.dev AI-attributed commits; Hugging Face agent-usage | quoted source |
| **New agents** | daily diff of ai.robots.txt and Cloudflare's signed-agent registry | self-identified |
| **Traffic** | this site's AI share; Cloudflare Radar bot statistics (live with a token); a robots.txt census from Common Crawl (share of sites naming and blocking each AI crawler, per crawl since 2019) | quoted source / sampled |
| **Before and after** | Wikimedia page views by agent type since 2015, Stack Overflow questions per month since 2012, StatCounter search share since 2009, plus the GitHub and robots.txt censuses, all with the same pre-AI markers | quoted source |

Every number carries a confidence tier; see the Methods page. Records can be bookmarked (browser-local "Saved" page), and the Notes section holds field notes and research briefs written as markdown.

## Stack

Next.js 16 (App Router, Turbopack) · Tailwind 4 · Drizzle ORM on Neon Postgres (HTTP driver) · Vercel · GitHub Actions as scheduler · vitest.

```
src/proxy.ts                 classifies every request, records hits after the response
src/lib/agents/              catalog, classifier, IP-range verification
src/lib/ingest/              one job per source (wikipedia, wikimedia, github, watched, github-signatures,
                             moltbook, osm, mcp, botcommits, agentwatch, radar, packages, baseline, ipranges, retention;
                             gharchive and robots-census receive results from the Actions workers)
scripts/gharchive.mjs        GH Archive census worker (.github/workflows/gharchive.yml, every 3 hours + backfill)
scripts/robots-census.mjs    Common Crawl robots.txt census worker (.github/workflows/robots-census.yml, weekly)
scripts/ai-robots-history.mjs dates every crawler token from the ai.robots.txt git history (.github/workflows/ai-robots-history.yml, monthly)
src/lib/github/signatures.ts self-disclosure rules
src/app/api/ingest/[source]  protected job runner (Bearer CRON_SECRET)
src/lib/stats*.ts            every page query, with empty shapes when the database is absent
content/investigations/      markdown notes
data/watchlist.json          seed repositories for the watched collector
data/reviews.json            human review decisions for self-disclosure signals
data/ai-robots.json          long-tail agent list vendored from ai.robots.txt
```

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000 (works without a database: "sensor offline")
npx vitest run       # unit tests
npm run build        # must pass offline, without DATABASE_URL
```

With a database: `vercel env pull .env.local` (or put `DATABASE_URL=postgres://…` there), then `npx drizzle-kit push` to create the tables.

Trigger a job locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/ingest/watched
```

Sources: `all`, `ipranges`, `wikipedia`, `wikimedia`, `moltbook`, `osm`, `mcp`, `botcommits`, `agentwatch`, `radar`, `packages`, `baseline`, `github`, `watched`, `github-signatures`, `retention`. `gharchive` and `robots-census` accept POSTed results from the workers and answer status questions on GET.

Run a worker locally (Node 22.18+ or 24; `--dry` prints instead of posting):

```bash
node --experimental-strip-types scripts/gharchive.mjs --dry --from 2026-09-05-12
node --experimental-strip-types scripts/robots-census.mjs --dry --crawl CC-MAIN-2025-30 --files 4
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | for data | Neon Postgres connection string (set by the Vercel Neon integration). |
| `CRON_SECRET` | for ingest | Bearer token for `/api/ingest/*`; also salts IP hashes. Same value in the GitHub repository secret. |
| `GITHUB_TOKEN` | recommended | Raises GitHub search from 10 to 30 requests/minute and unlocks the text-signature job. Classic token, **no scopes**. |
| `CLOUDFLARE_API_TOKEN` | optional | Live Cloudflare Radar charts on the Traffic page. Custom token with **Account → Radar → Read**. |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical URL if not `https://gcdtracker.vercel.app`. |

GitHub Actions needs the repository secret `CRON_SECRET` and the repository variable `SITE_URL`.

### Adding the GitHub token (3 steps)

1. On GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**. Name it `gcdtracker`, pick an expiry, **tick no scopes**, generate, copy the value.
2. On Vercel: project **gcdtracker-site (served at gcdtracker.vercel.app) → Settings → Environment Variables → Add**: key `GITHUB_TOKEN`, paste the value, environments Production and Preview, Save.
3. **Deployments → latest → ⋯ → Redeploy.** The next ingest run uses it.

### Adding the Cloudflare token (3 steps)

1. Sign up free at dash.cloudflare.com. Profile icon → **My Profile → API Tokens → Create Token → Custom token**: name `gcdtracker-radar`, permission **Account · Radar · Read**, Continue, Create, copy.
2. On Vercel: add `CLOUDFLARE_API_TOKEN` the same way as above.
3. Redeploy. Radar data is CC BY-NC 4.0.

## Scheduling

Vercel Hobby cron runs `/api/ingest/all` once a day (`vercel.json`). The real cadence comes from `.github/workflows/ingest.yml`, every 30 minutes. GitHub pauses scheduled workflows after 60 days without repository activity; any commit re-enables them.

Two heavier workers also run in Actions because their inputs are far too large for a serverless function:

- `gharchive.yml` streams GH Archive hourly files every three hours (`--auto` fills any gap in the last week). A backfill is a manual run with `from`, `to` and `shards` (up to 16 parallel jobs; each hour takes 2 to 10 seconds, so a year is roughly 16 machine-hours). Re-running a backfill only processes hours still missing.
- `robots-census.yml` samples 100 robots.txt archive files from every Common Crawl crawl not yet stored, weekly. A first run backfills every crawl since 2023 (about 35 crawls, a minute or two each).
- `ai-robots-history.yml` clones the ai.robots.txt list and walks its git history to date every token's first listing (monthly, about 90 seconds). Sightings only ever move earlier.

## Reviewing self-disclosure signals

Signals (PR bodies naming an AI tool) start as `unreviewed`. To record a decision, add an entry to `data/reviews.json`:

```json
{ "id": "github-pr-123456-generated-by", "status": "confirmed", "reason": "author confirmed in PR thread", "reviewedAt": "2026-09-06T00:00:00Z" }
```

Statuses: `confirmed`, `dismissed`, `needs_evidence`. The next ingest run applies it. Readers can suggest evidence through the issue template.

## Operating notes

- **Neon free tier**: 100 compute-hours a month, scale-to-zero after five idle minutes. Pages are cached for five minutes and ingest runs every 30 minutes to stay inside the budget. If compute runs out the site degrades to "sensor offline" until the reset; the planned fix is an Upstash Redis write buffer.
- **Retention**: visits, Wikipedia edits and forum posts are deleted after 180 days, GitHub PR samples after 90, ingest logs after 30. Watched-repository PRs, map changesets, MCP servers and sightings are kept.
- **Hide a guestbook note**: `update guestbook_notes set hidden = true where id = <id>;`
- **Refresh the long-tail agent list**: `node scripts/update-ai-robots.mjs` and commit `data/ai-robots.json`.
- **Refresh the signed-agent registry**: `node scripts/update-registry.mjs` and commit `data/signature-registry.json` (the registry host blocks cloud fetchers, so this runs from a workstation).
- **Rotate the secret**: update `CRON_SECRET` in Vercel (production + preview) and the GitHub repository secret together.
- **Next phase (not built)**: an open beacon other site owners can add so AI-agent visits are counted across many sites, with per-site keys and aggregate-only public stats.

## Privacy

Visitor IP addresses are never stored: only a /24 (IPv4) or /48 (IPv6) prefix and a salted hash. Raw rows exist only for AI/agent visits, signed requests, honeypot hits and robots.txt/llms.txt fetches; human traffic is a per-day counter. Saved bookmarks live only in the reader's browser.

## Licences

Code: MIT. Data exports: CC BY 4.0. Fonts (Newsreader, Inter, IBM Plex Mono): SIL OFL. Third-party records (pull-request titles, wiki revisions, changesets, posts) are public metadata republished with links; inclusion implies no endorsement or finding of misconduct. Quoted series keep their publishers' licences. The long-tail agent list comes from [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt).
