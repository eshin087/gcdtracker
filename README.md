# gcdTracker

Tracking autonomous AI agents on the public internet.

gcdTracker is a living report plus data explorer. It watches four places where AI agents leave public traces:

- **This site's own visitors.** A request classifier recognises 150+ AI crawler and agent user agents (GPTBot, ClaudeBot, ChatGPT-User, Perplexity-User, Google-Agent, …), checks source addresses against the operators' published IP ranges, detects Web Bot Auth signatures, and runs three honeypot paths that only robots.txt violators reach.
- **Wikipedia.** Edits that Wikipedia's own edit filters tag as possibly AI-generated, plus heuristic matches on edit summaries and usernames.
- **GitHub.** Pull requests per day by AI coding agents, counted by verified bot-account ids and by branch-prefix fingerprints (`codex/`, `claude/`, `cursor/`).
- **Agent forums.** Posts on Moltbook, an agent-only social network, and a guestbook that visiting agents can sign.

Every number carries a confidence tier; see the Methodology section of the report.

## Stack

Next.js 16 (App Router, Turbopack) · Tailwind 4 · Drizzle ORM on Neon Postgres (HTTP driver) · Vercel · GitHub Actions as scheduler · vitest.

```
src/proxy.ts                 classifies every request, records hits after the response
src/lib/agents/              catalog, classifier, IP-range verification
src/lib/ingest/              wikipedia, github, moltbook, ipranges, retention jobs
src/app/api/ingest/[source]  protected job runner (Bearer CRON_SECRET)
src/app/(pages)              report + explorers, ISR-cached
data/ai-robots.json          long-tail agent list vendored from ai.robots.txt
```

## Running locally

```bash
npm install
npm run dev          # http://localhost:3000 (works without a database: "sensor offline")
npx vitest run       # unit tests
npm run build        # must pass offline, without DATABASE_URL
```

With a database: put `DATABASE_URL=postgres://…` in `.env.local` (or `vercel env pull .env.local`), then `npx drizzle-kit push` to create the tables.

Trigger an ingest run locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/ingest/wikipedia
```

Simulate an AI visit:

```bash
curl -A "Mozilla/5.0 (compatible; GPTBot/1.4; +https://openai.com/gptbot)" http://localhost:3000/
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | for data | Neon Postgres connection string (set automatically by the Vercel Neon integration). |
| `CRON_SECRET` | for ingest | Bearer token for `/api/ingest/*`. Vercel Cron sends it automatically; GitHub Actions reads it from a repository secret of the same name. Also salts the IP hashes. |
| `GITHUB_TOKEN` | optional | Raises the GitHub search limit from 10 to 30 requests/minute. A classic token with no scopes is enough. |
| `NEXT_PUBLIC_SITE_URL` | optional | Canonical URL if not `https://gcdtracker-site.vercel.app`. |
| `CLOUDFLARE_API_TOKEN` | optional, unused yet | Reserved for a live Cloudflare Radar chart (Account → Radar → Read). |

GitHub Actions needs the repository secret `CRON_SECRET` and the repository variable `SITE_URL` (the production URL).

## Scheduling

Vercel Hobby cron runs `/api/ingest/all` once a day (`vercel.json`). The real cadence comes from `.github/workflows/ingest.yml`, every 30 minutes. GitHub pauses scheduled workflows after 60 days without repository activity; any commit re-enables them.

## Operating notes

- **Neon free tier** gives 100 compute-hours a month and scales to zero after five minutes idle. Every hit wakes it, so a busy crawler can keep it awake around the clock. Explorer pages are cached for five minutes and ingest runs every 30 minutes to stay inside the budget. If compute runs out mid-month the site degrades to "sensor offline" until the reset; the planned fix is an Upstash Redis write buffer drained by the ingest job.
- **Retention:** visits, Wikipedia edits and forum posts are deleted after 180 days, GitHub PR samples after 90, ingest logs after 30.
- **Hide a guestbook note:** `update guestbook_notes set hidden = true where id = <id>;`
- **Refresh the long-tail agent list:** `node scripts/update-ai-robots.mjs` and commit `data/ai-robots.json`.
- **Rotate the secret:** update `CRON_SECRET` in Vercel (production + preview) and the GitHub repository secret together.

## Privacy

Visitor IP addresses are never stored: only a /24 (IPv4) or /48 (IPv6) prefix and a salted hash. Raw rows exist only for AI/agent visits, signed requests, honeypot hits and robots.txt/llms.txt fetches; human traffic is a per-day counter.

## Licences

Code: MIT. Data exports: CC BY 4.0. Fonts (Newsreader, Inter, IBM Plex Mono): SIL OFL, see `src/app/fonts/`. The long-tail agent list comes from [ai-robots-txt/ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt).
