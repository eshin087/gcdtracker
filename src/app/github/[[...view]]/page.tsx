import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { SaveButton } from "@/components/SaveButton";
import { BarList, Empty, PageHeader, Segmented, StatTiles } from "@/components/ui";
import { fmtDay, fmtInt, fmtPct, fmtStamp, relTime } from "@/lib/format";
import { GITHUB_AGENTS, githubAgent, githubAgentLabel } from "@/lib/github/agents";
import { signatureLabel } from "@/lib/github/signatures";
import { SITE } from "@/lib/site";
import { getGithubByAgent, getGithubByDay, getGithubEvents, getOverview, hasDatabase } from "@/lib/stats";
import { getWatchedByDay, getWatchedRecent, getWatchedSignals, getWatchedSummary } from "@/lib/stats-sources";
import { getArchiveSummary } from "@/lib/stats-census";
import { Census } from "../Census";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "GitHub",
  description: "Pull requests opened by AI coding agents on GitHub: daily counts across all repositories, documented PRs in watched repositories, and self-disclosure signals.",
};

const VIEWS = ["census", "day", "agents", "prs", "watched", "signals"] as const;
const STATUSES = ["all", "unreviewed", "needs_evidence", "confirmed", "dismissed"] as const;
type View = (typeof VIEWS)[number];

export default async function GithubPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view: segments } = await params;
  const v = segments?.[0] ?? "census";
  const status = segments?.[1] ?? "all";
  if (!(VIEWS as readonly string[]).includes(v)) notFound();
  if ((segments?.length ?? 0) > 2 || (segments?.length === 2 && (v !== "signals" || !(STATUSES as readonly string[]).includes(status)))) notFound();
  const view = v as View;

  const db = hasDatabase();
  const [overview, byDay, watched, watchedByDay, archive] = await Promise.all([getOverview(), getGithubByDay(60), getWatchedSummary(), getWatchedByDay(60), getArchiveSummary()]);
  const lastDataDay = [...byDay].reverse().find((d) => d.botAccounts > 0 || d.branchPrefix > 0)?.day ?? null;

  const latest = archive.latest;
  const tiles = latest
    ? [
        { value: fmtInt(archive.last7.agentPrs), label: `agent PRs opened, last ${archive.last7.days} complete days`, sub: `every public event on GitHub · ${archive.prior7.days > 0 ? `${archive.prior7.agentPrs < archive.last7.agentPrs ? "+" : ""}${fmtInt(archive.last7.agentPrs - archive.prior7.agentPrs)} vs prior week` : "GH Archive census"}` },
        { value: archive.last7.prsOpened > 0 ? fmtPct(archive.last7.agentPrs / archive.last7.prsOpened, 2) : "–", label: "of all pull requests opened on GitHub", sub: `${fmtInt(archive.last7.prsOpened)} PRs opened in the same days` },
      ]
    : [
        { value: fmtInt(overview.agentPrs7d), label: "PRs by agent bot accounts, 7 days", sub: "all of GitHub, complete UTC days" },
        { value: fmtInt(overview.codexPrs7d), label: "PRs on codex/ branches, 7 days", sub: "Codex pushes under the user's account" },
      ];
  tiles.push(
    { value: fmtInt(watched.last7d), label: "agent PRs in watched repos, 7 days", sub: `${fmtInt(watched.repos.length)} repositories watched` },
    { value: fmtInt(watched.signals.unreviewed ?? 0), label: "self-disclosure signals awaiting review", sub: `${fmtInt(watched.signals.confirmed ?? 0)} confirmed` },
  );

  const seg = [
    { href: "/github", label: "All of GitHub", active: view === "census" },
    { href: "/github/day", label: "Search API by day", active: view === "day" },
    { href: "/github/agents", label: "By agent", active: view === "agents" },
    { href: "/github/prs", label: "Recent PRs", active: view === "prs" },
    { href: "/github/watched", label: "Watched repos", active: view === "watched" },
    { href: "/github/signals", label: "Self-disclosure signals", active: view === "signals" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader
        title="GitHub"
        sub="Three measurements. A census of every public GitHub event since 2022, counting pull requests by AI coding agents and their share of all PRs. Daily counts from the public search API. And every documented or self-disclosed agent PR in a watch-list of repositories, collected with evidence."
      />
      <StatTiles tiles={tiles} />
      <Segmented options={seg} label="GitHub views" />
      {view === "census" ? <Census summary={archive} db={db} /> : null}
      {view === "day" ? <ByDay byDay={byDay} watchedByDay={watchedByDay} db={db} lastDataDay={lastDataDay} /> : null}
      {view === "agents" ? <ByAgent db={db} /> : null}
      {view === "prs" ? <Prs db={db} /> : null}
      {view === "watched" ? <Watched watched={watched} db={db} /> : null}
      {view === "signals" ? <Signals status={status} db={db} /> : null}
    </div>
  );
}

function ByDay({
  byDay,
  watchedByDay,
  db,
  lastDataDay,
}: {
  byDay: Awaited<ReturnType<typeof getGithubByDay>>;
  watchedByDay: Awaited<ReturnType<typeof getWatchedByDay>>;
  db: boolean;
  lastDataDay: string | null;
}) {
  const anySearch = byDay.some((d) => d.botAccounts + d.branchPrefix > 0);
  const anyWatched = watchedByDay.some((d) => d.total > 0);
  if (!anySearch && !anyWatched) return <Empty db={db}>The GitHub poller runs every 30 minutes and backfills 30 days gradually.</Empty>;
  const days = byDay.map((d) => d.day);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, margin: "0 0 28px" }}>
        <MiniChart days={days} values={byDay.map((d) => d.botAccounts)} label="Bot-account PRs per day (all GitHub)" />
        <MiniChart days={days} values={byDay.map((d) => d.byAgent["codex-branch"] ?? 0)} label="codex/ branch PRs per day" />
        <MiniChart days={days} values={watchedByDay.map((d) => d.total)} label="Agent PRs in watched repos" />
      </div>
      {anySearch ? (
        <>
          <p className="label" style={{ marginBottom: 8 }}>
            PRs per day by agent bot accounts (accent) and by branch fingerprint (grey){lastDataDay ? ` · latest ${fmtDay(lastDataDay)}` : ""}
          </p>
          <BarList
            rows={[...byDay].reverse().map((d) => {
              const top = Object.entries(d.byAgent)
                .filter(([k]) => !k.startsWith("sig-"))
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([k, v]) => `${githubAgentLabel(k)} ${fmtInt(v)}`)
                .join(" · ");
              return { key: d.day, label: fmtDay(d.day), value: d.botAccounts, secondary: d.branchPrefix, title: top };
            })}
          />
        </>
      ) : (
        <p className="empty">Search counts arrive with the next ingest run.</p>
      )}
    </>
  );
}

async function ByAgent({ db }: { db: boolean }) {
  const rows = await getGithubByAgent(30);
  const seen = new Map(rows.map((r) => [r.agent, r]));
  const all = GITHUB_AGENTS.map((a) => ({ def: a, stat: seen.get(a.key) })).sort((x, y) => (y.stat?.prs ?? 0) - (x.stat?.prs ?? 0));
  const signatures = rows.filter((r) => r.tier === "text-signature");
  if (rows.length === 0) return <Empty db={db} />;
  return (
    <>
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
      {signatures.length > 0 ? (
        <>
          <p className="label" style={{ margin: "28px 0 8px" }}>
            Text signatures across all of GitHub · 30 days · self-identified rung, loose phrase matching
          </p>
          <BarList rows={signatures.map((s) => ({ key: s.agent, label: s.agent.replace("sig-", ""), value: s.prs, title: `${s.days} days` }))} variant="neutral" />
        </>
      ) : null}
    </>
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
            <th></th>
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
              <td>
                <SaveButton item={{ id: `ghev-${r.id}`, kind: "pull request", title: `${r.repo}#${r.number} ${r.title}`, url: r.url, sub: githubAgentLabel(r.agent) }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Watched({ watched, db }: { watched: Awaited<ReturnType<typeof getWatchedSummary>>; db: boolean }) {
  const recent = await getWatchedRecent(40);
  if (watched.total === 0) return <Empty db={db}>The watched-repository collector runs with every ingest cycle, a few repositories at a time.</Empty>;
  return (
    <>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        A seed list of repositories plus the repositories where our search feed sees the most agent activity. Every PR by a
        registered agent account is recorded with its evidence; PRs whose body names an AI tool become self-disclosure signals.
        {watched.lastIngest ? ` Last collection ${relTime(watched.lastIngest)}.` : ""}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginBottom: 24 }}>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Watched repositories · agent PRs in 30 days
          </div>
          <table className="tbl">
            <tbody>
              {watched.repos.map((r) => (
                <tr key={r.repository}>
                  <td className="mono">
                    <a href={`https://github.com/${r.repository}/pulls`}>{r.repository}</a>{" "}
                    {r.source === "auto" ? <span className="badge">auto</span> : null}
                  </td>
                  <td className="num">{fmtInt(r.count30d)}</td>
                  <td className="dim">{r.lastActivity ? relTime(r.lastActivity) : "not polled yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Agents · PRs in 90 days
          </div>
          <table className="tbl">
            <tbody>
              {watched.byAgent.map((a) => (
                <tr key={a.agentId}>
                  <td className="mono">{githubAgentLabel(a.agentId)}</td>
                  <td className="num">{fmtInt(a.count90d)}</td>
                  <td className="dim">{relTime(a.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dim sans" style={{ fontSize: 12, marginTop: 8 }}>
            {fmtInt(watched.documented30d)} documented · {fmtInt(watched.selfDisclosed30d)} self-disclosed in 30 days
          </p>
        </div>
      </div>
      <div className="label" style={{ marginBottom: 8 }}>
        Most recent agent pull requests
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Opened (UTC)</th>
              <th>Agent</th>
              <th>Pull request</th>
              <th>Evidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td className="mono dim">{fmtStamp(r.createdAt)}</td>
                <td className="mono">{r.agentId ? githubAgentLabel(r.agentId) : (r.actorLogin ?? "?")}</td>
                <td>
                  <a href={r.url}>
                    <span className="mono">{r.repository}</span> {r.title.slice(0, 100)}
                  </a>
                  {r.state ? <span className="dim"> · {r.state}</span> : null}
                </td>
                <td className="dim" style={{ fontSize: 12, maxWidth: 320 }}>
                  {r.attribution === "documented_agent" ? <span className="badge ok">documented</span> : <span className="badge">self-disclosed</span>}{" "}
                  {r.evidence?.slice(0, 140)}
                </td>
                <td>
                  <SaveButton item={{ id: `pr-${r.id}`, kind: "pull request", title: `${r.repository} · ${r.title}`, url: r.url, sub: r.evidence ?? undefined }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

async function Signals({ status, db }: { status: string; db: boolean }) {
  const rows = await getWatchedSignals(status === "all" ? undefined : status, 100);
  const seg = STATUSES.map((s) => ({ href: s === "all" ? "/github/signals" : `/github/signals/${s}`, label: s.replace("_", " "), active: status === s }));
  return (
    <>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Pull requests in watched repositories whose body names an AI tool (&ldquo;Generated with Claude Code&rdquo;, an AI
        co-author trailer, an <code className="mono">aider:</code> prefix). Detection flags contributions, not people. A signal
        is a lead until a person reviews it; only confirmed signals count toward totals.{" "}
        <a href={`${SITE.repo}/issues/new?template=evidence.md`}>Suggest evidence ↗</a>
      </p>
      <Segmented options={seg} label="Signal status" />
      {rows.length === 0 ? (
        <Empty db={db}>No self-disclosure signals {status === "all" ? "yet" : `with status ${status.replace("_", " ")}`}.</Empty>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Pull request</th>
                <th>Rule</th>
                <th>Excerpt</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <a href={c.url ?? "#"}>
                      <span className="mono">{c.repository}</span> {c.title?.slice(0, 90) ?? c.activityId}
                    </a>
                  </td>
                  <td className="dim">{signatureLabel(c.ruleId)}</td>
                  <td style={{ maxWidth: 360 }}>{c.excerpt ?? "–"}</td>
                  <td>
                    <span className={`badge ${c.status === "confirmed" ? "ok" : c.status === "dismissed" ? "" : "warn"}`}>{c.status.replace("_", " ")}</span>
                    {c.reason ? <div className="dim" style={{ fontSize: 12 }}>{c.reason}</div> : null}
                  </td>
                  <td>
                    <SaveButton item={{ id: `sig-${c.id}`, kind: "signal", title: `${c.repository} · ${c.title ?? c.activityId}`, url: c.url, sub: c.excerpt ?? undefined }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="dim sans" style={{ fontSize: 12.5, marginTop: 14 }}>
        Reviews live in <Link href={`${SITE.repo}/blob/main/data/reviews.json`}>data/reviews.json</Link> and are re-applied on every run.
      </p>
    </>
  );
}
