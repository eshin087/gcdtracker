import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { BarList, Empty, PageHeader, Pagination, Segmented, StatTiles, TierBadge } from "@/components/ui";
import { fmtDay, fmtInt, fmtStamp, relTime } from "@/lib/format";
import { getOverview, getWikiByDay, getWikiEditors, getWikiEdits, hasDatabase } from "@/lib/stats";
import { Wikimedia } from "../Wikimedia";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Wikipedia & Wikimedia",
  description: "Edits on English Wikipedia flagged as possibly AI-generated, bot volume across Wikimedia, agent-like Wikidata bots, and AI-generated media on Commons.",
};

type Tier = "all" | "1" | "2";
interface Route {
  view: "day" | "edits" | "editors" | "wikimedia";
  tier: Tier;
  page: number;
}

function parse(segments: string[] | undefined): Route | null {
  const [a, b, c] = segments ?? [];
  if (!a) return { view: "day", tier: "all", page: 1 };
  if (a === "editors" && !b) return { view: "editors", tier: "all", page: 1 };
  if (a === "wikimedia" && !b) return { view: "wikimedia", tier: "all", page: 1 };
  if (a === "edits") {
    const tier: Tier = b === "1" || b === "2" ? b : "all";
    if (b && !["all", "1", "2"].includes(b)) return null;
    const page = c ? Number(c) : 1;
    if (!Number.isInteger(page) || page < 1 || page > 500) return null;
    return { view: "edits", tier, page };
  }
  return null;
}

const WIKI = "https://en.wikipedia.org";

export default async function WikipediaPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view: segments } = await params;
  const route = parse(segments);
  if (!route) notFound();

  const db = hasDatabase();
  const [overview, byDay] = await Promise.all([getOverview(), getWikiByDay(60)]);
  const latestTotals = [...byDay].reverse().find((d) => d.total !== null);
  const flaggedLatest = latestTotals ? latestTotals.tier1 + latestTotals.tier2 : 0;
  const per10k = latestTotals && latestTotals.total ? (flaggedLatest / latestTotals.total) * 10_000 : null;

  const tiles = [
    { value: fmtInt(overview.wikiFlagged7d), label: "flagged edits, last 7 days", sub: `${fmtInt(overview.wikiFlaggedTotal)} stored in total` },
    {
      value: latestTotals ? fmtInt(latestTotals.total) : "–",
      label: "edits per day on enwiki",
      sub: latestTotals ? `Wikimedia metrics for ${fmtDay(latestTotals.day)} (lags a few days)` : "waiting for Wikimedia metrics",
    },
    { value: per10k === null ? "–" : per10k.toFixed(1), label: "flagged per 10,000 edits", sub: latestTotals ? `on ${fmtDay(latestTotals.day)}` : undefined },
    { value: latestTotals?.bot !== null && latestTotals ? fmtInt(latestTotals.bot) : "–", label: "classic bot edits per day", sub: "rule-based bots such as ClueBot; not AI" },
  ];

  const seg = [
    { href: "/wikipedia", label: "By day", active: route.view === "day" },
    { href: "/wikipedia/edits", label: "Flagged edits", active: route.view === "edits" },
    { href: "/wikipedia/editors", label: "Editors", active: route.view === "editors" },
    { href: "/wikipedia/wikimedia", label: "Across Wikimedia", active: route.view === "wikimedia" },
  ];

  return (
    <div className="shell explorer">
      <PageHeader
        title="Wikipedia & Wikimedia"
        sub="Edits on English Wikipedia that Wikipedia's own edit filters tag as possibly AI-generated, plus edits whose summaries say an AI tool was used. Across the wider Wikimedia family: bot volume per project, agent-like Wikidata bots, and AI-generated media on Commons."
      />
      <StatTiles tiles={tiles} />
      <Segmented options={seg} label="Wikipedia views" />

      {route.view === "day" ? <ByDay byDay={byDay} db={db} /> : null}
      {route.view === "edits" ? <Edits route={route} db={db} /> : null}
      {route.view === "editors" ? <Editors db={db} /> : null}
      {route.view === "wikimedia" ? <Wikimedia db={db} /> : null}
    </div>
  );
}

function ByDay({ byDay, db }: { byDay: Awaited<ReturnType<typeof getWikiByDay>>; db: boolean }) {
  if (!byDay.some((d) => d.tier1 + d.tier2 > 0 || d.total)) return <Empty db={db}>The Wikipedia poller runs every 30 minutes.</Empty>;
  const days = byDay.map((d) => d.day);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24, margin: "0 0 28px" }}>
        <MiniChart days={days} values={byDay.map((d) => d.tier1)} label="Filter-flagged per day" />
        <MiniChart days={days} values={byDay.map((d) => d.tier2)} label="Heuristic matches per day" />
        <MiniChart days={days} values={byDay.map((d) => d.total ?? 0)} label="All enwiki edits per day" />
      </div>
      <p className="label" style={{ marginBottom: 8 }}>
        Flagged edits per day (filter-flagged + heuristic)
      </p>
      <BarList
        rows={[...byDay].reverse().map((d) => ({
          key: d.day,
          label: fmtDay(d.day),
          value: d.tier1 + d.tier2,
          title: `${fmtInt(d.tier1)} filter-flagged, ${fmtInt(d.tier2)} heuristic${d.total ? `, ${fmtInt(d.total)} edits in total` : ""}`,
        }))}
      />
    </>
  );
}

async function Edits({ route, db }: { route: Route; db: boolean }) {
  const tier = route.tier === "all" ? undefined : (Number(route.tier) as 1 | 2);
  const { rows, page, pages, total } = await getWikiEdits({ tier, page: route.page, perPage: 50 });
  const base = `/wikipedia/edits/${route.tier}`;
  const tierSeg = [
    { href: "/wikipedia/edits", label: "All tiers", active: route.tier === "all" },
    { href: "/wikipedia/edits/1", label: "Filter-flagged", active: route.tier === "1" },
    { href: "/wikipedia/edits/2", label: "Heuristic", active: route.tier === "2" },
  ];
  return (
    <>
      <Segmented options={tierSeg} label="Confidence tier" />
      {rows.length === 0 ? (
        <Empty db={db} />
      ) : (
        <>
          <p className="label" style={{ marginBottom: 8 }}>
            {fmtInt(total)} edits · newest first
          </p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When (UTC)</th>
                  <th>Page</th>
                  <th>Editor</th>
                  <th>Tier</th>
                  <th>Signals</th>
                  <th className="num">Δ bytes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.wiki}-${r.rcid}`}>
                    <td className="mono dim">{fmtStamp(r.ts)}</td>
                    <td>
                      <a href={r.url}>{r.title}</a>
                      {r.comment ? (
                        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                          {r.comment.slice(0, 140)}
                        </div>
                      ) : null}
                    </td>
                    <td className="mono">
                      <a href={`${WIKI}/wiki/Special:Contributions/${encodeURIComponent(r.user)}`}>{r.user}</a>
                    </td>
                    <td>
                      <TierBadge tier={r.tier} />
                    </td>
                    <td className="dim" style={{ fontSize: 12 }}>
                      {r.signals.join(", ")}
                    </td>
                    <td className="num">{r.newLen !== null && r.oldLen !== null ? fmtInt(r.newLen - r.oldLen) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pages={pages} hrefFor={(p) => (p === 1 ? base : `${base}/${p}`)} />
        </>
      )}
    </>
  );
}

async function Editors({ db }: { db: boolean }) {
  const rows = await getWikiEditors(30);
  if (rows.length === 0) return <Empty db={db} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Editor</th>
            <th className="num">Flagged edits (30d)</th>
            <th className="num">Filter-flagged</th>
            <th className="num">Heuristic</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user}>
              <td className="mono">
                <a href={`${WIKI}/wiki/Special:Contributions/${encodeURIComponent(r.user)}`}>{r.user}</a>
              </td>
              <td className="num">{fmtInt(r.edits)}</td>
              <td className="num">{fmtInt(r.tier1)}</td>
              <td className="num">{fmtInt(r.tier2)}</td>
              <td className="dim">{relTime(r.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
