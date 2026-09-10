import { CalendarHeatmap } from "@/components/census-charts";
import { TimelineChart } from "@/components/charts";
import { BarList, Empty } from "@/components/ui";
import { fmtDate, fmtInt, fmtPct } from "@/lib/format";
import { githubAgentLabel } from "@/lib/github/agents";
import { GH_ARCHIVE } from "@/lib/ingest/gharchive";
import { AGENT_LAUNCHES, type ArchivePeriod, type ArchiveSummary, fmtMonth, getArchiveAgents, getArchiveDaily, getArchiveMonthly, getArchiveShareByDay, isComparableArchivePeriod, isPartialArchive } from "@/lib/stats-census";

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
  const [monthly, daily, agents, shareDays] = await Promise.all([getArchiveMonthly(), getArchiveDaily(90), getArchiveAgents(30), getArchiveShareByDay()]);
  if (monthly.length === 0) {
    return (
      <Empty db={db}>
        The GH Archive census is a retained historical snapshot. Repository automation is disabled, so its coverage does not advance automatically.
      </Empty>
    );
  }
  const completeDaily = daily.filter((d) => d.hours === 24);
  const legacyHours = monthly.reduce((sum, p) => sum + Math.max(0, p.hours - p.validatedHours), 0);
  const commitSigs = sumTools(monthly, (p) => p.commitSignatures);
  const prSigs = sumTools(monthly, (p) => p.prSignatures);
  const partialMonth = monthly.at(-1);
  const monthLabel = (p: ArchivePeriod) => `${p.period}-01`;

  return (
    <>
      <p className="page-sub" style={{ maxWidth: "76ch" }}>
        Public events observed by GH Archive since {summary.firstDay ? fmtDate(summary.firstDay) : "the backfill started"}, counted hour by hour from{" "}
        <a href={GH_ARCHIVE.site}>GH Archive</a>. A pull request is attributed to an agent when opened by a known agent bot account
        or on an agent branch prefix, and the share uses pull requests present in the same archived hours. Archive gaps can bias both counts and shares.{" "}
        {summary.hours > 0 ? `${fmtInt(summary.hours)} hours stored across ${fmtInt(summary.completeDays)} days.` : ""}
      </p>

      <TimelineChart
        days={monthly.map(monthLabel)}
        bars={monthly.map((p) => p.agentPrs)}
        barLabel="Agent PRs opened per month"
        line={monthly.map((p) => isComparableArchivePeriod(p) && p.prsOpened > 0 ? (100 * p.agentPrs) / p.prsOpened : null)}
        lineLabel="Share of all PRs opened (%)"
        annotations={AGENT_LAUNCHES.filter((l) => monthly.some((m) => m.period === l.day.slice(0, 7))).map((l) => ({ ...l, day: `${l.day.slice(0, 7)}-01` }))}
        title="Agent-attributed pull requests observed in GH Archive, by month"
        xLabel={fmtMonth}
        muted={monthly.map((p) => isPartialArchive(p) || p.validatedHours < p.hours)}
      />
      <p className="dim sans" style={{ fontSize: 12.5, marginTop: 6 }}>
        {legacyHours > 0 ? `${fmtInt(legacyHours)} archived hours use legacy collection rules. Pale bars include those legacy periods; current headline comparisons use only validated complete days. ` : ""}
        {partialMonth && partialMonth.hours < 28 * 24 ? `${partialMonth.period} covers ${fmtInt(partialMonth.hours)} hours so far. ` : ""}
        {monthly.some(isPartialArchive)
          ? `Pale bars mark periods with incomplete or unusually low archive coverage (fewer than ${fmtInt(1_000)} pull requests an hour where GitHub normally opens several thousand): both counts and shares may be biased.`
          : ""}
      </p>

      {shareDays.length > 0 ? <figure className="home-chart">
        <h2>Agent share by day</h2>
        <CalendarHeatmap label="Agent share of observed pull requests per UTC day" days={shareDays.map((d) => ({ day: d.day, value: d.share, partial: d.partial || d.hours !== 24, title: d.day + " · " + (d.share === null ? "share unavailable" : fmtPct(d.share)) + " · " + fmtInt(d.agentPrs) + " of " + fmtInt(d.prsOpened) + " observed PRs · " + d.hours + "/24 hours" }))} />
        <figcaption>Hatching marks incomplete or unusually low archive coverage. Missing coverage can distort shares; it does not imply zero activity. Shares are withheld for legacy, incomplete and unusually low-coverage periods.</figcaption>
      </figure> : null}

      {completeDaily.length > 1 ? (
        <div style={{ marginTop: 28 }}>
          <TimelineChart sharedScale
            days={completeDaily.map((d) => d.period)}
            bars={completeDaily.map((d) => d.agentPrs)}
            barLabel="Agent PRs opened per day"
            line={completeDaily.map((d) => d.prsOpened)}
            lineLabel="All PRs opened"
            title="Recent days with 24 archived hours; coverage and rule versions may differ"
            height={220}
            muted={completeDaily.map((p) => isPartialArchive(p) || p.validatedHours < p.hours)}
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
                Co-author trailers and “generated with” lines in commit messages, {commitSigs.from} to {commitSigs.to}. GitHub removed commit lists from the public event
                feed during 2025, so this series cannot extend past that point; the search-based signature counts on the “By agent” view continue it.
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
              <th>Archive</th>
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
                <td>{isPartialArchive(m) ? <span className="badge warn">partial</span> : <span className="badge ok">complete</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
