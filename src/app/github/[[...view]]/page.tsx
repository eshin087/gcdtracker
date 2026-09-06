import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { BarList, Empty, PageHeader, Segmented, StatTiles } from "@/components/ui";
import { fmtDay, fmtInt, fmtStamp } from "@/lib/format";
import { GITHUB_AGENTS, githubAgent, githubAgentLabel } from "@/lib/github/agents";
import { getGithubByAgent, getGithubByDay, getGithubEvents, getOverview, hasDatabase } from "@/lib/stats";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "GitHub",
  description: "Pull requests opened by AI coding agents on GitHub, counted per day and per agent.",
};

const VIEWS = ["day", "agents", "prs"] as const;
type View = (typeof VIEWS)[number];

export default async function GithubPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view: segments } = await params;
  const v = segments?.[0] ?? "day";
  if (!(VIEWS as readonly string[]).includes(v) || (segments?.length ?? 0) > 1) notFound();
  const view = v as View;

  const db = hasDatabase();
  const [overview, byDay] = await Promise.all([getOverview(), getGithubByDay(60)]);
  const lastDataDay = [...byDay].reverse().find((d) => d.botAccounts > 0 || d.branchPrefix > 0)?.day ?? null;

  const tiles = [
    { value: fmtInt(overview.agentPrs7d), label: "PRs by agent bot accounts, 7 days", sub: "complete UTC days only" },
    { value: fmtInt(overview.codexPrs7d), label: "PRs on codex/ branches, 7 days", sub: "OpenAI Codex pushes under the user's account" },
    { value: fmtInt(GITHUB_AGENTS.length), label: "agents tracked", sub: `${GITHUB_AGENTS.filter((a) => a.tier === "bot-account").length} bot accounts, ${GITHUB_AGENTS.filter((a) => a.tier === "branch-prefix").length} branch fingerprints` },
    { value: lastDataDay ? fmtDay(lastDataDay) : "–", label: "latest day with data", sub: "polled hourly through the public search API" },
  ];

  const seg = [
    { href: "/github", label: "By day", active: view === "day" },
    { href: "/github/agents", label: "By agent", active: view === "agents" },
    { href: "/github/prs", label: "Recent PRs", active: view === "prs" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader
        title="GitHub"
        sub="Daily counts of pull requests opened by AI coding agents. Bot accounts are counted by their verified numeric ids; agents that push under the user's own account are fingerprinted by branch prefix."
      />
      <StatTiles tiles={tiles} />
      <Segmented options={seg} label="GitHub views" />
      {view === "day" ? <ByDay byDay={byDay} db={db} /> : null}
      {view === "agents" ? <ByAgent db={db} /> : null}
      {view === "prs" ? <Prs db={db} /> : null}
    </div>
  );
}

function ByDay({ byDay, db }: { byDay: Awaited<ReturnType<typeof getGithubByDay>>; db: boolean }) {
  if (!byDay.some((d) => d.botAccounts + d.branchPrefix > 0)) return <Empty db={db}>The GitHub poller runs every 30 minutes and backfills 30 days gradually.</Empty>;
  const days = byDay.map((d) => d.day);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, margin: "0 0 28px" }}>
        <MiniChart days={days} values={byDay.map((d) => d.botAccounts)} label="Bot-account PRs per day" />
        <MiniChart days={days} values={byDay.map((d) => d.byAgent["codex-branch"] ?? 0)} label="codex/ branch PRs per day" />
        <MiniChart days={days} values={byDay.map((d) => d.byAgent["copilot"] ?? 0)} label="Copilot coding agent PRs per day" />
      </div>
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
  );
}

async function ByAgent({ db }: { db: boolean }) {
  const rows = await getGithubByAgent(30);
  const seen = new Map(rows.map((r) => [r.agent, r]));
  const all = GITHUB_AGENTS.map((a) => ({ def: a, stat: seen.get(a.key) })).sort(
    (x, y) => (y.stat?.prs ?? 0) - (x.stat?.prs ?? 0),
  );
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
                  <div className="dim sans" style={{ fontSize: 12, marginTop: 2, fontFamily: "var(--font-inter)" }}>
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
