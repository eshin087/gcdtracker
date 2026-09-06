import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBadge, PageHeader, StatTiles } from "@/components/ui";
import { CATALOG, CURATED, IP_SOURCES, LONG_TAIL } from "@/lib/agents/catalog";
import type { AgentDef } from "@/lib/agents/types";
import { fmtInt, relTime } from "@/lib/format";
import { getVisitsByAgent } from "@/lib/stats";
import { getWatchedSummary } from "@/lib/stats-sources";
import { GITHUB_AGENTS } from "@/lib/github/agents";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Agents",
  description: "Directory of known AI crawlers and agents, how they identify themselves, and whether they can be verified.",
};

function verification(d: AgentDef): string {
  if (d.controlTokenOnly) return "control token only";
  if (d.ipSource) return "published IP ranges";
  if (d.rdns?.length) return "reverse DNS";
  return "user agent only";
}

function robotsLabel(r: AgentDef["robots"]): string {
  return { yes: "respects", no: "ignores", partial: "may ignore", unknown: "unknown" }[r];
}

export default async function AgentsPage() {
  const [seen, watched] = await Promise.all([getVisitsByAgent(90, 500), getWatchedSummary()]);
  const stats = new Map(seen.map((s) => [s.slug, s]));

  const withHits = (list: AgentDef[]) =>
    [...list].sort((a, b) => (stats.get(b.slug)?.hits ?? 0) - (stats.get(a.slug)?.hits ?? 0) || a.name.localeCompare(b.name));

  const curated = withHits(CURATED.filter((d) => !d.controlTokenOnly));
  const control = CURATED.filter((d) => d.controlTokenOnly);
  const longTail = withHits(LONG_TAIL);
  const seenCount = CATALOG.filter((d) => stats.has(d.slug)).length;

  return (
    <div className="shell explorer">
      <PageHeader
        title="Agents"
        sub="Every user-agent token the classifier knows. Curated entries were checked against the vendor's own documentation; the long tail is vendored from the ai.robots.txt project and refreshed by hand."
      />
      <StatTiles
        tiles={[
          { value: fmtInt(CATALOG.length), label: "known agent definitions", sub: `${CURATED.length} curated, ${LONG_TAIL.length} from ai.robots.txt` },
          { value: fmtInt(IP_SOURCES.length), label: "published IP-range lists", sub: "refreshed daily for verification" },
          { value: fmtInt(seenCount), label: "seen on this site, 90 days" },
        ]}
      />

      <h2 className="page-title" style={{ fontSize: 24, marginTop: 8 }}>
        Documented agents
      </h2>
      <AgentTable defs={curated} stats={stats} />

      <h2 className="page-title" style={{ fontSize: 24, marginTop: 40 }}>
        Control tokens
      </h2>
      <p className="page-sub">
        These names exist only for robots.txt rules. Blocking them is meaningful; seeing them in logs is not expected.
      </p>
      <AgentTable defs={control} stats={stats} />

      <h2 className="page-title" style={{ fontSize: 24, marginTop: 40 }}>
        Coding agents on GitHub
      </h2>
      <p className="page-sub">
        Agents that open pull requests under their own identity. Daily counts come from the GitHub search API across all of
        GitHub; watched-repository counts come from our own collector.
      </p>
      <CodingAgents watched={watched} />

      <details style={{ marginTop: 40 }}>
        <summary className="page-title" style={{ fontSize: 24, cursor: "pointer" }}>
          Long tail ({LONG_TAIL.length})
        </summary>
        <p className="page-sub" style={{ marginTop: 8 }}>
          Vendored from{" "}
          <a href="https://github.com/ai-robots-txt/ai.robots.txt" className="sans">
            ai-robots-txt/ai.robots.txt
          </a>
          . Categories are inferred from the list&apos;s descriptions; a few entries are corrected by hand.
        </p>
        <AgentTable defs={longTail} stats={stats} />
      </details>
    </div>
  );
}

function AgentTable({ defs, stats }: { defs: AgentDef[]; stats: Map<string, Awaited<ReturnType<typeof getVisitsByAgent>>[number]> }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Operator</th>
            <th>Category</th>
            <th>robots.txt</th>
            <th>Verification</th>
            <th className="num">Hits (90d)</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {defs.map((d) => {
            const s = stats.get(d.slug);
            return (
              <tr key={d.slug}>
                <td className="mono">
                  <Link href={`/agents/${encodeURIComponent(d.slug)}`}>{d.name}</Link>
                </td>
                <td>{d.operator}</td>
                <td>
                  <CategoryBadge category={d.category} />
                </td>
                <td className="dim">{robotsLabel(d.robots)}</td>
                <td className="dim">{verification(d)}</td>
                <td className="num">{s ? fmtInt(s.hits) : <span className="dim">0</span>}</td>
                <td className="dim">{s ? relTime(s.lastSeen) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CodingAgents({ watched }: { watched: Awaited<ReturnType<typeof getWatchedSummary>> }) {
  const counts = new Map(watched.byAgent.map((b) => [b.agentId, b]));
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Vendor</th>
            <th>Identified by</th>
            <th className="num">Watched-repo PRs (90d)</th>
            <th>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {GITHUB_AGENTS.map((g) => {
            const c = counts.get(g.key);
            const method = g.tier === "bot-account" ? `bot account #${g.id}` : `branch prefix ${g.query.replace("head:", "")}`;
            return (
              <tr key={g.key}>
                <td className="mono">{g.url ? <a href={g.url}>{g.label}</a> : g.label}</td>
                <td>{g.vendor}</td>
                <td className="dim">{method}</td>
                <td className="num">{c ? fmtInt(c.count90d) : <span className="dim">0</span>}</td>
                <td className="dim">{c?.lastActivity ? relTime(c.lastActivity) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
