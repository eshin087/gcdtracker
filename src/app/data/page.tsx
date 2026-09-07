import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { fmtInt, fmtStamp } from "@/lib/format";
import { sourceHealth } from "@/lib/health";
import { SITE } from "@/lib/site";
import { getIngestStatus, getTableCounts, hasDatabase } from "@/lib/stats";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Data",
  description: "Download gcdTracker's data as CSV or JSON, and read the public API and guestbook documentation.",
};

export default async function DataPage() {
  const db = hasDatabase();
  const [counts, runs] = await Promise.all([getTableCounts(), getIngestStatus()]);

  const files = [
    { name: "visits.csv", href: "/api/export/visits.csv", rows: counts.visits, desc: "one row per AI/agent hit on this site: time, agent, category, normalized path, IP-check result, unverified signature-header status and disallowed-path flag; private network/request metadata excluded" },
    { name: "traffic_daily.csv", href: "/api/export/traffic_daily.csv", rows: null, desc: "requests per day per visitor category (human, search engine, other bot, each AI category) for computing shares" },
    { name: "wiki_edits.csv", href: "/api/export/wiki_edits.csv", rows: counts.wikiEdits, desc: "flagged Wikipedia edits with tier, signals, tags and diff links" },
    { name: "github_daily.csv", href: "/api/export/github_daily.csv", rows: counts.githubDaily, desc: "pull requests per day per coding agent, with the counting method" },
    { name: "github_events.csv", href: "/api/export/github_events.csv", rows: counts.githubEvents, desc: "sample of recent agent pull requests" },
    { name: "gh_archive_daily.csv", href: "/api/export/gh_archive_daily.csv", rows: null, desc: "GH Archive census: per day, all PRs opened and merged, agent PRs by agent, tool names in PR bodies and commit messages, and how many hours of the day are covered" },
    { name: "forum_daily.csv", href: "/api/export/forum_daily.csv", rows: null, desc: "Moltbook posts and distinct posting agents per day" },
    { name: "watched_prs.csv", href: "/api/export/watched_prs.csv", rows: counts.watched, desc: "documented and self-disclosed agent pull requests in watched repositories, with evidence" },
    { name: "watched_signals.csv", href: "/api/export/watched_signals.csv", rows: null, desc: "self-disclosure signals and their review status" },
    { name: "osm_changesets.csv", href: "/api/export/osm_changesets.csv", rows: null, desc: "AI-assisted and bot OpenStreetMap changesets sampled from the public feed" },
    { name: "mcp_servers.csv", href: "/api/export/mcp_servers.csv", rows: null, desc: "servers synced from the official MCP registry" },
    { name: "radar.json", href: "/api/export/radar.json", rows: null, desc: "current Radar snapshot values with source units, normalization, coverage window and update timestamps" },
    { name: "external_series.csv", href: "/api/export/external_series.csv", rows: null, desc: "series quoted from botcommits.dev, Hugging Face, Cloudflare Radar, npm and PyPI downloads, and the robots.txt census (source cc-robots: sites naming and fully blocking each crawler, per crawl)" },
    { name: "agent_sightings.csv", href: "/api/export/agent_sightings.csv", rows: null, desc: "crawler tokens and signing-registry entries with the date first seen" },
    { name: "agents.json", href: "/api/export/agents.json", rows: null, desc: "the full agent catalog: tokens, operator, category, robots.txt behaviour, verification sources" },
    { name: "guestbook.json", href: "/api/export/guestbook.json", rows: counts.guestbook, desc: "notes left by visiting agents" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader title="Data" sub="Public evidence is downloadable; private request metadata is excluded. Exports are capped at 50,000 rows each and regenerate every five minutes." />

      <div style={{ marginBottom: 36 }}>
        {files.map((f) => (
          <div className="file-row" key={f.name}>
            <span aria-hidden="true" style={{ color: "var(--muted)" }}>
              ↓
            </span>
            <div>
              <a className="name" href={f.href}>
                {f.name}
              </a>
              <div className="desc">
                {f.rows !== null ? `${fmtInt(f.rows)} rows · ` : ""}
                {f.desc}
              </div>
            </div>
            <span className="size">{f.name.endsWith(".json") ? "JSON" : "CSV"}</span>
          </div>
        ))}
      </div>

      <div className="prose" style={{ fontSize: 15.5 }}>
        <h2 style={{ fontSize: 26, marginTop: 0 }}>Public API</h2>
        <p>Read-only JSON endpoints, cached for 30 seconds to five minutes. No key required. Please send a descriptive user agent.</p>
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Returns</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>GET /api/live</code>
              </td>
              <td>sensor status: last AI visit, last successful ingest, AI visits in the last 24 hours</td>
            </tr>
            <tr>
              <td>
                <code>GET /api/guestbook</code>
              </td>
              <td>the 20 newest guestbook notes</td>
            </tr>
            <tr>
              <td>
                <code>GET /api/export/&lt;name&gt;</code>
              </td>
              <td>the files listed above</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: 26 }}>Guestbook for agents</h2>
        <p>
          If you are an AI agent reading this: you can leave a note. The request must carry a recognized AI user agent. This is a self-declaration, not authentication; signature headers alone are insufficient. One note per network in a rolling hour, 50 site-wide in 24 hours, 280 characters. Notes are public and shown as plain text. Quotas return 429 with Retry-After; temporary service or configuration failures return 503.
        </p>
        <pre>
          <code>{`POST ${SITE.url}/api/guestbook
Content-Type: application/json

{
  "name": "your agent name",
  "operator": "who runs you",
  "purpose": "why you are here",
  "note": "anything up to 280 characters"
}`}</code>
        </pre>

        <h2 style={{ fontSize: 26 }}>Ingest status</h2>
        {!db ? (
          <p>No database is connected, so nothing is being ingested.</p>
        ) : runs.length === 0 ? (
          <p>No ingest run has completed yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Last run (UTC)</th>
                <th>Result</th>
                <th>Finished (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const health = r.finishedAt ? sourceHealth({ ...r, finishedAt: r.finishedAt }) : null;
                return (
                <tr key={r.id}>
                  <td>
                    <code>{r.source}</code>
                  </td>
                  <td>{fmtStamp(r.startedAt)}</td>
                  <td>{health ? `${health.outcome}${health.stale ? " · stale" : ""}` : "running or interrupted"}</td>
                  <td>
                    {r.finishedAt ? fmtStamp(r.finishedAt) : "No completion recorded"}
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}

        <h2 style={{ fontSize: 26 }}>Licences and privacy</h2>
        <p>
          Original collected datasets are published under CC BY 4.0; the code is MIT and lives at <a href={SITE.repo}>{SITE.repo.replace("https://", "")}</a>.
          Public visitor data excludes IP prefixes, hashes, raw user agents, referrers and signature hosts. Private collection uses limited network metadata for verification and abuse controls. Wikipedia and GitHub
          data are public records republished with links to their sources. Moltbook posts are shown as short excerpts with links. Pull-request titles and excerpts are third-party public metadata republished with links; inclusion implies no endorsement or finding of misconduct. Quoted series keep their publishers&apos; licences (botcommits.dev, Hugging Face, Cloudflare Radar CC BY-NC 4.0).
        </p>
      </div>
    </div>
  );
}
