import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { BarList, CategoryBadge, Empty, PageHeader, Segmented, StatTiles, VerifiedBadge } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/agents/types";
import { fmtDay, fmtInt, fmtPct, fmtStamp, relTime } from "@/lib/format";
import {
  getCategoryBreakdown,
  getOverview,
  getRecentVisits,
  getRobotsViolations,
  getTrafficByDay,
  getVisitsByAgent,
  hasDatabase,
} from "@/lib/stats";
import { trapPlacement } from "@/lib/trap";

export const revalidate = 300;

const VIEWS = ["day", "agents", "violations", "recent"] as const;
type View = (typeof VIEWS)[number];

export const metadata: Metadata = {
  title: "Visitors",
  description: "AI crawlers and agents observed visiting this site, by day and by agent.",
};

function viewFrom(segments: string[] | undefined): View | null {
  const v = segments?.[0] ?? "day";
  return (VIEWS as readonly string[]).includes(v) && (segments?.length ?? 0) <= 1 ? (v as View) : null;
}

export default async function VisitorsPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view: segments } = await params;
  const view = viewFrom(segments);
  if (!view) notFound();

  const db = hasDatabase();
  const [overview, byDay, breakdown] = await Promise.all([getOverview(), getTrafficByDay(60), getCategoryBreakdown(30)]);

  const tiles = [
    { value: fmtInt(overview.aiVisits7d), label: "AI visits, last 7 days", sub: `${fmtInt(overview.aiVisitsTotal)} since the sensor went live` },
    { value: fmtPct(overview.aiShare7d), label: "AI share of all requests, 7 days", sub: `${fmtInt(overview.requests7d)} requests counted` },
    { value: fmtInt(overview.distinctAgents30d), label: "distinct AI agents, 30 days", sub: `${fmtPct(overview.verifiedShare30d)} of decidable visits IP-verified` },
    { value: fmtInt(overview.violations), label: "robots.txt violations", sub: "honeypot hits, all time" },
  ];

  const seg = [
    { href: "/visitors", label: "By day", active: view === "day" },
    { href: "/visitors/agents", label: "By agent", active: view === "agents" },
    { href: "/visitors/violations", label: "robots.txt violations", active: view === "violations" },
    { href: "/visitors/recent", label: "Recent hits", active: view === "recent" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader
        title="Visitors"
        sub="Every request to this site passes through a classifier that recognises AI crawlers, user-triggered fetchers, browsing agents and coding tools by user agent and signature, then checks the source IP against the operator's published ranges."
      />
      <StatTiles tiles={tiles} />
      <Segmented options={seg} label="Visitor views" />

      {view === "day" ? <ByDay byDay={byDay} breakdown={breakdown} db={db} /> : null}
      {view === "agents" ? <ByAgent db={db} /> : null}
      {view === "violations" ? <Violations db={db} /> : null}
      {view === "recent" ? <Recent db={db} /> : null}
    </div>
  );
}

function ByDay({
  byDay,
  breakdown,
  db,
}: {
  byDay: Awaited<ReturnType<typeof getTrafficByDay>>;
  breakdown: Awaited<ReturnType<typeof getCategoryBreakdown>>;
  db: boolean;
}) {
  const any = byDay.some((d) => d.total > 0);
  if (!any) return <Empty db={db}>The first AI visit will show up here within about five minutes of happening.</Empty>;
  const rows = [...byDay].reverse().map((d) => ({
    key: d.day,
    label: fmtDay(d.day),
    value: d.ai,
    secondary: d.total,
    title: `${fmtInt(d.ai)} AI of ${fmtInt(d.total)} requests`,
  }));
  const total = breakdown.reduce((a, b) => a + b.count, 0);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, margin: "0 0 28px" }}>
        <MiniChart days={byDay.map((d) => d.day)} values={byDay.map((d) => d.ai)} label="AI visits per day" />
        <MiniChart days={byDay.map((d) => d.day)} values={byDay.map((d) => d.total)} label="All requests per day" />
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            Who sends requests · 30 days
          </div>
          <table className="tbl">
            <tbody>
              {breakdown.map((b) => (
                <tr key={b.category}>
                  <td>{CATEGORY_LABELS[b.category] ?? b.category}</td>
                  <td className="num">{fmtInt(b.count)}</td>
                  <td className="num dim">{total > 0 ? fmtPct(b.count / total) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="label" style={{ marginBottom: 8 }}>
        AI visits per day (accent) against all requests (grey)
      </p>
      <BarList rows={rows} />
    </>
  );
}

async function ByAgent({ db }: { db: boolean }) {
  const agents = await getVisitsByAgent(30);
  if (agents.length === 0) return <Empty db={db} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Operator</th>
            <th>Category</th>
            <th className="num">Hits (30d)</th>
            <th className="num">IP verified</th>
            <th className="num">Not in ranges</th>
            <th className="num">Signed</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.slug}>
              <td className="mono">
                <Link href={`/agents/${encodeURIComponent(a.slug)}`}>{a.name}</Link>
              </td>
              <td>{a.operator}</td>
              <td>
                <CategoryBadge category={a.category} />
              </td>
              <td className="num">{fmtInt(a.hits)}</td>
              <td className="num">{fmtInt(a.verified)}</td>
              <td className="num">{fmtInt(a.unverified)}</td>
              <td className="num">{fmtInt(a.signed)}</td>
              <td className="dim" title={a.lastSeen ?? ""}>
                {relTime(a.lastSeen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function Violations({ db }: { db: boolean }) {
  const rows = await getRobotsViolations(90);
  if (rows.length === 0)
    return (
      <Empty db={db}>
        No one has followed a disallowed link yet. Three honeypot paths exist: one hidden in the footer, one that appears only
        in robots.txt, and one that appears only in llms.txt.
      </Empty>
    );
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Visitor</th>
            <th>Category</th>
            <th>How they found it</th>
            <th className="num">Hits (90d)</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.slug}-${r.token}-${i}`}>
              <td className="mono">
                {r.slug ? <Link href={`/agents/${encodeURIComponent(r.slug)}`}>{r.name}</Link> : r.name.slice(0, 80)}
              </td>
              <td>
                <CategoryBadge category={r.category} />
              </td>
              <td>{placementLabel(r.token)}</td>
              <td className="num">{fmtInt(r.hits)}</td>
              <td className="dim">{relTime(r.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function placementLabel(token: string | null): string {
  if (!token) return "unknown";
  if (token === "private") return "guessed a /private/ path";
  switch (trapPlacement(token)) {
    case "footer":
      return "hidden footer link";
    case "robots":
      return "read robots.txt, then visited the disallowed path";
    case "llms":
      return "read llms.txt, then visited the disallowed path";
    default:
      return "guessed a /trap/ path";
  }
}

async function Recent({ db }: { db: boolean }) {
  const rows = await getRecentVisits(60);
  if (rows.length === 0) return <Empty db={db} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>When (UTC)</th>
            <th>Agent</th>
            <th>Category</th>
            <th>Path</th>
            <th>Country</th>
            <th>Verification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono dim">{fmtStamp(r.ts)}</td>
              <td className="mono">
                {r.agentSlug ? (
                  <Link href={`/agents/${encodeURIComponent(r.agentSlug)}`}>{r.agentName ?? r.agentSlug}</Link>
                ) : (
                  <span title={r.ua}>{r.ua.slice(0, 40)}</span>
                )}
              </td>
              <td>
                <CategoryBadge category={r.category as never} />
              </td>
              <td className="mono">
                {r.path}
                {r.robotsViolation ? (
                  <>
                    {" "}
                    <span className="badge warn">trap</span>
                  </>
                ) : null}
              </td>
              <td className="dim">{r.country ?? "–"}</td>
              <td>
                <VerifiedBadge verified={r.verified} />
                {r.signed ? (
                  <>
                    {" "}
                    <span className="badge ok">signed</span>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
