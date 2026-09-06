import { TimelineChart } from "@/components/charts";
import { BarList, Empty } from "@/components/ui";
import { fmtDay, fmtInt, fmtPct } from "@/lib/format";
import { githubAgentLabel } from "@/lib/github/agents";
import { GH_ARCHIVE } from "@/lib/ingest/gharchive";
import { type ArchivePeriod, type ArchiveSummary, getArchiveAgents, getArchiveDaily, getArchiveMonthly } from "@/lib/stats-census";

const TOOL_LABELS: Record<string, string> = {
  claude: "Claude (Code)",
  codex: "Codex",
  chatgpt: "ChatGPT",
  copilot: "Copilot",
  cursor: "Cursor",
  windsurf: "Windsurf",
  jules: "Jules",
  devin: "Devin",
  aider: "Aider",
  gemini: "Gemini",
  kiro: "Kiro",
  "amazon-q": "Amazon Q",
  openhands: "OpenHands",
  sweep: "Sweep",
  other: "other",
};

const LAUNCHES = [
  { day: "2025-02-24", label: "Claude Code preview" },
  { day: "2025-05-19", label: "Codex & Copilot agent" },
];

function sumTools(periods: ArchivePeriod[], pick: (p: ArchivePeriod) => Record<string, number> | null): { rows: Array<{ tool: string; value: number }>; from: string | null; to: string | null } {
  const totals = new Map<string, number>();
  let from: string | null = null;
  let to: string | null = null;
  for (const p of periods) {
    const t = pick(p);
    if (!t) continue;
    from ??= p.period;
    to = p.period;
    for (const [k, v] of Object.entries(t)) totals.set(k, (totals.get(k) ?? 0) + v);
  }
  return { rows: [...totals].map(([tool, value]) => ({ tool, value })).sort((a, b) => b.value - a.value), from, to };
}

export async function Census({ summary, db }: { summary: ArchiveSummary; db: boolean }) {
  const [monthly, daily, agents] = await Promise.all([getArchiveMonthly(), getArchiveDaily(90), getArchiveAgents(30)]);
  if (monthly.length === 0) {
    return (
      <Empty db={db}>
        The GH Archive census is filled by a GitHub Actions worker. Hours appear here as it runs; the backfill from January 2025 takes a few hours on first launch.
      </Empty>
    );
  }
  const completeDaily = daily.filter((d) => d.hours === 24);
  const commitSigs = sumTools(monthly, (p) => p.commitSignatures);
  const prSigs = sumTools(monthly, (p) => p.prSignatures);
  const partialMonth = monthly.at(-1);
  const monthLabel = (p: ArchivePeriod) => `${p.period}-01`;

  return (
    <>
      <p className="page-sub" style={{ maxWidth: "76ch" }}>
        Every public GitHub event since {summary.firstDay ? fmtDay(summary.firstDay) : "the backfill started"}, counted hour by hour from{" "}
        <a href={GH_ARCHIVE.site}>GH Archive</a>. No sampling and no search caps: an agent pull request is one opened by a known agent bot account
        or on an agent branch prefix, and the share is measured against every pull request opened that hour.{" "}
        {summary.hours > 0 ? `${fmtInt(summary.hours)} hours stored across ${fmtInt(summary.completeDays)} days.` : ""}
      </p>

      <TimelineChart
        days={monthly.map(monthLabel)}
        bars={monthly.map((p) => p.agentPrs)}
        barLabel="Agent PRs opened per month"
        line={monthly.map((p) => (p.prsOpened > 0 ? (100 * p.agentPrs) / p.prsOpened : 0))}
        lineLabel="Share of all PRs opened (%)"
        annotations={LAUNCHES.filter((l) => monthly.some((m) => m.period === l.day.slice(0, 7)))}
        title="Agent pull requests across all of GitHub, by month"
      />
      {partialMonth && partialMonth.hours < 28 * 24 ? (
        <p className="dim sans" style={{ fontSize: 12.5, marginTop: 6 }}>
          {partialMonth.period} covers {fmtInt(partialMonth.hours)} hours so far.
        </p>
      ) : null}

      {completeDaily.length > 1 ? (
        <div style={{ marginTop: 28 }}>
          <TimelineChart
            days={completeDaily.map((d) => d.period)}
            bars={completeDaily.map((d) => d.agentPrs)}
            barLabel="Agent PRs opened per day"
            line={completeDaily.map((d) => d.prsOpened)}
            lineLabel="All PRs opened"
            title="Last 90 complete days"
            height={220}
          />
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, marginTop: 28 }}>
        <div>
          <p className="label" style={{ marginBottom: 8 }}>
            By agent · last 30 complete days · bot account or branch prefix
          </p>
          {agents.length === 0 ? (
            <p className="empty">No complete day yet.</p>
          ) : (
            <BarList rows={agents.map((a) => ({ key: a.agent, label: githubAgentLabel(a.agent), value: a.prs, title: a.merged > 0 ? `${fmtInt(a.merged)} merged` : undefined }))} />
          )}
        </div>
        <div>
          <p className="label" style={{ marginBottom: 8 }}>
            Commits naming a tool · {commitSigs.from ?? "–"} to {commitSigs.to ?? "–"} · self-identified rung
          </p>
          {commitSigs.rows.length === 0 ? (
            <p className="empty">Commit messages are only present in the archive until GitHub slimmed the public feed; the backfill has not reached those months yet.</p>
          ) : (
            <>
              <BarList rows={commitSigs.rows.slice(0, 10).map((r) => ({ key: r.tool, label: TOOL_LABELS[r.tool] ?? r.tool, value: r.value }))} variant="neutral" />
              <p className="dim sans" style={{ fontSize: 12.5, marginTop: 8 }}>
                Co-author trailers and “generated with” lines in commit messages. GitHub removed commit lists from the public event feed after {commitSigs.to}, so this
                series ends there; the search-based signature counts on the “By agent” view continue it.
              </p>
            </>
          )}
        </div>
      </div>

      {prSigs.rows.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <p className="label" style={{ marginBottom: 8 }}>
            PR descriptions naming a tool (not already attributed) · {prSigs.from} to {prSigs.to}
          </p>
          <BarList rows={prSigs.rows.slice(0, 10).map((r) => ({ key: r.tool, label: TOOL_LABELS[r.tool] ?? r.tool, value: r.value }))} variant="neutral" />
        </div>
      ) : null}

      <div className="tbl-wrap" style={{ marginTop: 28 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">PRs opened</th>
              <th className="num">By agents</th>
              <th className="num">Share</th>
              <th className="num">Agent PRs merged</th>
              <th className="num">Hours</th>
            </tr>
          </thead>
          <tbody>
            {[...monthly].reverse().map((m) => (
              <tr key={m.period}>
                <td className="mono">{m.period}</td>
                <td className="num">{fmtInt(m.prsOpened)}</td>
                <td className="num">{fmtInt(m.agentPrs)}</td>
                <td className="num">{m.prsOpened > 0 ? fmtPct(m.agentPrs / m.prsOpened, 2) : "–"}</td>
                <td className="num">{m.agentMerged > 0 ? fmtInt(m.agentMerged) : <span className="dim">–</span>}</td>
                <td className="num dim">{fmtInt(m.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
