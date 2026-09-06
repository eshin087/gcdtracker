import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { BarList, Empty, PageHeader, Segmented, StatTiles } from "@/components/ui";
import { fmtDay, fmtInt, fmtStamp, relTime } from "@/lib/format";
import { GITHUB_AGENTS, githubAgent, githubAgentLabel } from "@/lib/github/agents";
import { OBSERVATORY } from "@/lib/ingest/observatory";
import {
  getGithubByAgent,
  getGithubByDay,
  getGithubEvents,
  getObservatoryByDay,
  getObservatoryCandidates,
  getObservatoryRecent,
  getObservatorySummary,
  getOverview,
  hasDatabase,
} from "@/lib/stats";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "GitHub",
  description: "Pull requests opened by AI coding agents on GitHub, counted per day and per agent, plus documented PRs in watched repositories.",
};

const VIEWS = ["day", "agents", "prs", "watched", "signals"] as const;
type View = (typeof VIEWS)[number];

function Attribution({ generatedAt, stale }: { generatedAt: string | null; stale: boolean }) {
  return (
    <p className="sans" style={{ fontSize: 12.5, color: "var(--muted)", margin: "14px 0 0" }}>
      Source: <a href={OBSERVATORY.site}>{OBSERVATORY.name}</a> ({OBSERVATORY.site.replace("https://", "")}), a separately built
      site that records documented agent pull requests in a watch-list of repositories; mirrored here so history outlives its
      90-day window.{generatedAt ? ` Snapshot ${fmtStamp(generatedAt)}.` : ""}{" "}
      {stale ? <span className="badge warn">snapshot older than 36h</span> : null}
    </p>
  );
}

export default async function GithubPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view: segments } = await params;
  const v = segments?.[0] ?? "day";
  if (!(VIEWS as readonly string[]).includes(v) || (segments?.length ?? 0) > 1) notFound();
  const view = v as View;

  const db = hasDatabase();
  const [overview, byDay, obs, obsByDay] = await Promise.all([getOverview(), getGithubByDay(60), getObservatorySummary(), getObservatoryByDay(60)]);
  const lastDataDay = [...byDay].reverse().find((d) => d.botAccounts > 0 || d.branchPrefix > 0)?.day ?? null;

  const tiles = [
    { value: fmtInt(overview.agentPrs7d), label: "PRs by agent bot accounts, 7 days", sub: "GitHub search, complete UTC days" },
    { value: fmtInt(overview.codexPrs7d), label: "PRs on codex/ branches, 7 days", sub: "Codex pushes under the user's account" },
    { value: fmtInt(obs.last7d), label: "documented PRs in watched repos, 7 days", sub: `${fmtInt(obs.total)} mirrored from the observatory` },
    { value: lastDataDay ? fmtDay(lastDataDay) : "–", label: "latest day with search data", sub: `${GITHUB_AGENTS.length} agents tracked` },
  ];

  const seg = [
    { href: "/github", label: "By day", active: view === "day" },
    { href: "/github/agents", label: "By agent", active: view === "agents" },
    { href: "/github/prs", label: "Recent PRs", active: view === "prs" },
    { href: "/github/watched", label: "Watched repos", active: view === "watched" },
    { href: "/github/signals", label: "Self-disclosure signals", active: view === "signals" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader
        title="GitHub"
        sub="Two measurements. Daily counts of pull requests by AI coding agents across all of GitHub, from the public search API. And every documented agent PR in a watch-list of repositories, mirrored from the gcdTracker observatory."
      />
      <StatTiles tiles={tiles} />
      <Segmented options={seg} label="GitHub views" />
      {view === "day" ? <ByDay byDay={byDay} obsByDay={obsByDay} db={db} /> : null}
      {view === "agents" ? <ByAgent db={db} /> : null}
      {view === "prs" ? <Prs db={db} /> : null}
      {view === "watched" ? <Watched obs={obs} db={db} /> : null}
      {view === "signals" ? <Signals obs={obs} db={db} /> : null}
    </div>
  );
}

function ByDay({
  byDay,
  obsByDay,
  db,
}: {
  byDay: Awaited<ReturnType<typeof getGithubByDay>>;
  obsByDay: Awaited<ReturnType<typeof getObservatoryByDay>>;
  db: boolean;
}) {
  const anySearch = byDay.some((d) => d.botAccounts + d.branchPrefix > 0);
  const anyObs = obsByDay.some((d) => d.total > 0);
  if (!anySearch && !anyObs) return <Empty db={db}>The GitHub poller runs every 30 minutes and backfills 30 days gradually.</Empty>;
  const days = byDay.map((d) => d.day);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, margin: "0 0 28px" }}>
        <MiniChart days={days} values={byDay.map((d) => d.botAccounts)} label="Bot-account PRs per day (search)" />
        <MiniChart days={days} values={byDay.map((d) => d.byAgent["codex-branch"] ?? 0)} label="codex/ branch PRs per day" />
        <MiniChart days={days} values={obsByDay.map((d) => d.total)} label="Documented PRs in watched repos" />
      </div>
      {anySearch ? (
        <>
          <p className="label" style={{ marginBottom: 8 }}>
            PRs per day by agent bot accounts (accent) and by branch fingerprint (grey)
          </p>
          <BarList
            rows={[...byDay].reverse().map((d) => {
              const top = Object.entries(d.byAgent)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([k, v]) => `${githubAgentLabel(k)} ${fmtInt(v)}`)
                .join(" · ");
              return { key: d.day, label: fmtDay(d.day), value: d.botAccounts, secondary: d.branchPrefix, title: top };
            })}
          />
        </>
      ) : (
        <p className="empty">Search counts arrive with the first ingest run; the watched-repo series above comes from the observatory mirror.</p>
      )}
    </>
  );
}

async function ByAgent({ db }: { db: boolean }) {
  const rows = await getGithubByAgent(30);
  const seen = new Map(rows.map((r) => [r.agent, r]));
  const all = GITHUB_AGENTS.map((a) => ({ def: a, stat: seen.get(a.key) })).sort((x, y) => (y.stat?.prs ?? 0) - (x.stat?.prs ?? 0));
  if (rows.length === 0) return <Empty db={db} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Vendor</th>
            <th>Counted by</th>
            <th className="num">PRs (30d)</th>
            <th className="num">Per day</th>
            <th>Latest day</th>
          </tr>
        </thead>
        <tbody>
          {all.map(({ def, stat }) => (
            <tr key={def.key}>
              <td className="mono">
                {def.url ? <a href={def.url}>{def.label}</a> : def.label}
                {def.note ? (
                  <div className="dim" style={{ fontSize: 12, marginTop: 2, fontFamily: "var(--font-inter)" }}>
                    {def.note}
                  </div>
                ) : null}
              </td>
              <td>{def.vendor}</td>
              <td>
                <span className={`badge ${def.tier === "bot-account" ? "ok" : ""}`}>
                  {def.tier === "bot-account" ? `bot account #${def.id}` : `branch prefix ${def.query.replace("head:", "")}`}
                </span>
              </td>
              <td className="num">{stat ? fmtInt(stat.prs) : <span className="dim">0</span>}</td>
              <td className="num">{stat && stat.days > 0 ? fmtInt(stat.prs / stat.days) : "–"}</td>
              <td className="dim">{stat?.lastDay ? fmtDay(stat.lastDay) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Prs({ db }: { db: boolean }) {
  const rows = await getGithubEvents(60);
  if (rows.length === 0) return <Empty db={db} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Opened (UTC)</th>
            <th>Agent</th>
            <th>Pull request</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono dim">{fmtStamp(r.createdAt)}</td>
              <td>{githubAgent(r.agent)?.label ?? r.agent}</td>
              <td>
                <a href={r.url}>
                  <span className="mono">
                    {r.repo}#{r.number}
                  </span>{" "}
                  {r.title.slice(0, 110)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Watched({ obs, db }: { obs: Awaited<ReturnType<typeof getObservatorySummary>>; db: boolean }) {
  const recent = await getObservatoryRecent(40);
  if (obs.total === 0) return <Empty db={db}>The observatory mirror runs with every ingest cycle.</Empty>;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 24 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Watched repositories · PRs in 90 days
          </div>
          <table className="tbl">
            <tbody>
              {obs.repos.map((r) => (
                <tr key={r.repository}>
                  <td className="mono">
                    <a href={`https://github.com/${r.repository}/pulls`}>{r.repository}</a>
                  </td>
                  <td className="num">{fmtInt(r.count90d)}</td>
                  <td className="dim">{relTime(r.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Documented agents · PRs in 90 days
          </div>
          <table className="tbl">
            <tbody>
              {obs.byAgent.map((a) => (
                <tr key={a.agentId}>
                  <td className="mono">{a.agentId}</td>
                  <td className="num">{fmtInt(a.count90d)}</td>
                  <td className="dim">{relTime(a.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="label" style={{ marginBottom: 8 }}>
        Most recent documented pull requests
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Opened (UTC)</th>
              <th>Agent</th>
              <th>Pull request</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="mono dim">{fmtStamp(r.createdAt)}</td>
                <td className="mono">{r.agentId ?? r.actorLogin ?? "?"}</td>
                <td>
                  <a href={r.url}>
                    <span className="mono">{r.repository}</span> {r.title.slice(0, 100)}
                  </a>
                </td>
                <td className="dim">{r.state ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Attribution generatedAt={obs.generatedAt} stale={obs.stale} />
    </>
  );
}

async function Signals({ obs, db }: { obs: Awaited<ReturnType<typeof getObservatorySummary>>; db: boolean }) {
  const rows = await getObservatoryCandidates(50);
  return (
    <>
      <p className="page-sub" style={{ maxWidth: "70ch" }}>
        Pull requests in the watched repositories whose body carries a self-disclosure line such as &ldquo;Generated with Claude
        Code&rdquo; or an AI co-author trailer, found by the observatory&apos;s signature rules. They are candidates, not confirmed
        agent PRs, until a person reviews them.
      </p>
      {rows.length === 0 ? (
        <Empty db={db}>No self-disclosure candidates mirrored yet.</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Excerpt</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.ruleId}</td>
                  <td>{c.excerpt ?? "–"}</td>
                  <td>
                    <span className="badge">{c.status}</span>
                  </td>
                  <td>{c.url ? <a href={c.url}>open PR ↗</a> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Attribution generatedAt={obs.generatedAt} stale={obs.stale} />
    </>
  );
}
