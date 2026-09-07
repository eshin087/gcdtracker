import type { Metadata } from "next";
import { MiniChart, TimelineChart } from "@/components/charts";
import { BarList, Empty, PageHeader, StatTiles } from "@/components/ui";
import { fmtInt, relTime } from "@/lib/format";
import { BOTCOMMITS } from "@/lib/ingest/botcommits";
import { hasDatabase } from "@/lib/stats";
import { getMcpSummary, getSeries } from "@/lib/stats-sources";
import { getPackageStats } from "@/lib/stats-census";
import { PACKAGE_SOURCES } from "@/lib/ingest/packages";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Tooling",
  description: "The supply side of agent activity: MCP servers published per day, AI-attributed commits across GitHub, and which coding agents use the Hugging Face Hub.",
};

const TOOL_LABELS: Record<string, string> = {
  claude: "Claude Code",
  copilot_agent: "Copilot coding agent (bot-authored)",
  copilot_coauthor: "Copilot coding agent (squash-merged trailer)",
  jules: "Jules (Google)",
  openai_codex: "OpenAI Codex",
  gemini_assist: "Gemini Code Assist",
  devin: "Devin",
  aider: "Aider",
  total: "All tracked tools",
};

export default async function ToolingPage() {
  const db = hasDatabase();
  const [mcp, bot, hf, hub, packages] = await Promise.all([getMcpSummary(60), getSeries("botcommits"), getSeries("hf-agent-usage"), getSeries("hf-hub"), getPackageStats()]);
  const agentPkgs = packages.filter((p) => p.def.role === "agent");
  const frameworkPkgs = packages.filter((p) => p.def.role === "framework");
  const agentWeek = agentPkgs.reduce((s, p) => s + p.last7, 0);
  const topAgent = agentPkgs[0]?.last7 ? agentPkgs[0] : null;
  // Weekly totals of agent CLI downloads for the long-run chart (npm goes back to 2024).
  const weekly = new Map<string, number>();
  for (const p of agentPkgs.filter((p) => p.def.registry === "npm")) {
    for (const pt of p.points) {
      const d = new Date(`${pt.period}T00:00:00Z`);
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      weekly.set(monday, (weekly.get(monday) ?? 0) + pt.value);
    }
  }
  const weeks = [...weekly].sort((a, b) => a[0].localeCompare(b[0])).slice(0, -1);

  const claude = bot.claude ?? [];
  const total = bot.total ?? [];
  const lastFull = total.length >= 2 ? total[total.length - 2] : null;
  const toolsLatest = Object.entries(bot)
    .filter(([k]) => k !== "total")
    .map(([k, pts]) => ({ key: k, value: pts.length >= 2 ? pts[pts.length - 2].value : (pts[pts.length - 1]?.value ?? 0) }))
    .sort((a, b) => b.value - a.value);

  // Hugging Face: latest day per agent (share of requests).
  const hfLatest = Object.entries(hf)
    .filter(([k]) => k.endsWith(":requests"))
    .map(([k, pts]) => ({ agent: k.replace(":requests", ""), value: pts[pts.length - 1]?.value ?? 0, day: pts[pts.length - 1]?.period ?? "" }))
    .filter((r) => r.agent !== "unknown")
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const hubRate = hub["new-models-per-hour"]?.slice(-1)[0]?.value ?? null;

  return (
    <div className="shell explorer">
      <PageHeader
        title="Tooling"
        sub="Agent activity has a supply side: how many machines are being handed an agent, the tools agents are built from, and the infrastructure they hit. Four public measures, each quoted with its source."
      />
      <StatTiles
        tiles={[
          { value: agentWeek > 0 ? fmtInt(agentWeek) : "–", label: "agent CLI installs, last 7 days", sub: topAgent ? `${topAgent.def.label} leads with ${fmtInt(topAgent.last7)} · npm + PyPI` : "npm + PyPI downloads" },
          { value: fmtInt(mcp.new7d), label: "MCP servers published, 7 days", sub: `${fmtInt(mcp.total)} tracked from the official registry` },
          { value: lastFull ? fmtInt(lastFull.value) : "–", label: "AI-attributed commits on GitHub, last full month", sub: lastFull ? `${lastFull.period} · botcommits.dev` : "botcommits.dev" },
          { value: hfLatest[0] ? `${hfLatest[0].value.toFixed(0)}%` : "–", label: hfLatest[0] ? `of agent requests to Hugging Face from ${hfLatest[0].agent}` : "Hugging Face agent usage", sub: hfLatest[0]?.day ? `on ${hfLatest[0].day}` : undefined },
          { value: hubRate !== null ? fmtInt(hubRate) : "–", label: "new Hub models per hour", sub: "from the newest 100 model repos" },
        ]}
      />

      <div className="section-head">
        <h2>Agent installs</h2>
        <a className="more" href="https://api.npmjs.org/downloads/">
          npm + pypistats.org ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Coding agents are shipped as packages, and both registries publish daily download counts. Downloads count every install and
        CI run, not people, but they are the widest public measure of how many machines are being handed an agent. npm history
        runs from January 2024; PyPI serves the last 180 days.
      </p>
      {packages.every((p) => p.points.length === 0) ? (
        <Empty db={db} />
      ) : (
        <>
          {weeks.length > 4 ? (
            <TimelineChart days={weeks.map((w) => w[0])} bars={weeks.map((w) => w[1])} barLabel="npm agent CLI downloads per week" title="Agent CLI downloads per week (npm: Claude Code, Codex, Copilot, Gemini, OpenCode, Qwen)" height={220} />
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 28, marginTop: 20 }}>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Agents · downloads, last 7 days
              </div>
              <BarList rows={agentPkgs.map((p) => ({ key: p.def.name, label: `${p.def.label} · ${p.def.registry}`, value: p.last7, secondary: p.prior7, title: `${p.def.name} · prior week ${fmtInt(p.prior7)}` }))} />
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>
                Frameworks agents are built from · last 7 days
              </div>
              <BarList rows={frameworkPkgs.map((p) => ({ key: p.def.name, label: `${p.def.label} · ${p.def.registry}`, value: p.last7, secondary: p.prior7, title: `${p.def.name} · prior week ${fmtInt(p.prior7)}` }))} variant="neutral" />
            </div>
          </div>
          <p className="dim sans" style={{ fontSize: 12.5, marginTop: 8 }}>
            Grey bar: the week before. Sources: <a href={PACKAGE_SOURCES.npm}>api.npmjs.org</a> and <a href="https://pypistats.org">pypistats.org</a> (mirrors excluded).
          </p>
        </>
      )}

      <div className="section-head">
        <h2>MCP registry</h2>
        <a className="more" href="https://registry.modelcontextprotocol.io">
          registry.modelcontextprotocol.io ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        The Model Context Protocol registry is where tool servers for agents are published. New servers per day is a direct
        measure of how fast agents are being given new capabilities. Synced incrementally with every ingest run.
      </p>
      {mcp.total === 0 ? (
        <Empty db={db} />
      ) : (
        <>
          <MiniChart days={mcp.byDay.map((d) => d.day)} values={mcp.byDay.map((d) => d.c)} label="Servers published per day" />
          <div className="tbl-wrap" style={{ marginTop: 16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Published</th>
                  <th>Server</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {mcp.recent.slice(0, 15).map((s) => (
                  <tr key={s.name}>
                    <td className="dim">{s.publishedAt ? relTime(s.publishedAt) : "–"}</td>
                    <td className="mono">{s.url ? <a href={s.url}>{s.title ?? s.name}</a> : (s.title ?? s.name)}</td>
                    <td className="dim">{s.description?.slice(0, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="section-head">
        <h2>AI-attributed commits across GitHub</h2>
        <a className="more" href={BOTCOMMITS.site}>
          botcommits.dev ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        botcommits.dev counts commits whose messages or trailers attribute them to a coding tool, across all public GitHub
        activity (GH Archive until September 2025, the search API since). The latest month is partial. Quoted as published.
      </p>
      {claude.length === 0 ? (
        <Empty db={db} />
      ) : (
        <>
          <TimelineChart days={claude.map((p) => `${p.period}-01`)} bars={total.map((p) => p.value)} barLabel="All tracked tools, commits per month" line={claude.map((p) => p.value)} lineLabel="Claude Code" title="AI-attributed commits per month" />
          <p className="label" style={{ margin: "20px 0 8px" }}>
            By tool · last full month
          </p>
          <BarList rows={toolsLatest.map((t) => ({ key: t.key, label: TOOL_LABELS[t.key] ?? t.key, value: t.value }))} variant="neutral" />
        </>
      )}

      <div className="section-head">
        <h2>Coding agents on the Hugging Face Hub</h2>
        <a className="more" href="https://huggingface.co/datasets/huggingface/agent-usage">
          huggingface/agent-usage ↗
        </a>
      </div>
      <p className="page-sub" style={{ maxWidth: "72ch" }}>
        Hugging Face publishes which coding agents hit its Hub, from the agent token their requests carry. Share of agent
        requests per day, quoted as published{hfLatest[0]?.day ? `; the dataset’s latest published day is ${hfLatest[0].day}` : ""}.
      </p>
      {hfLatest.length === 0 ? <Empty db={db} /> : <BarList rows={hfLatest.map((r) => ({ key: r.agent, label: r.agent, value: r.value }))} format={(v) => `${v.toFixed(1)}%`} />}
    </div>
  );
}
