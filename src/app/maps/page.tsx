import type { Metadata } from "next";
import { MiniChart } from "@/components/charts";
import { SaveButton } from "@/components/SaveButton";
import { BarList, Empty, PageHeader, StatTiles } from "@/components/ui";
import { fmtDay, fmtInt, fmtPct, fmtStamp, relTime } from "@/lib/format";
import { hasDatabase } from "@/lib/stats";
import { getOsmByDay, getOsmSummary } from "@/lib/stats-sources";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Maps",
  description: "AI-assisted and bot edits to OpenStreetMap, sampled from the public changeset feed.",
};

const KIND_LABEL: Record<string, string> = {
  rapid: "RapiD (AI-suggested features)",
  mapwithai: "MapWithAI",
  osmose: "Osmose (automated QA fixes)",
  bot: "Bots and bulk scripts",
  "other-ai": "Other AI-assisted",
};

export default async function MapsPage() {
  const db = hasDatabase();
  const [daily, summary] = await Promise.all([getOsmByDay(60), getOsmSummary()]);
  const byDay = daily.slice(Math.max(0, daily.findIndex((d) => d.sampled > 0)));
  const share = summary.sampled7d > 0 ? summary.ai7d / summary.sampled7d : null;
  const any = byDay.some((d) => d.sampled > 0);

  return (
    <div className="shell explorer">
      <PageHeader
        title="Maps"
        sub="OpenStreetMap publishes every changeset. We sample the newest ones continuously and keep those made with AI-suggested geometry (RapiD, MapWithAI), automated QA tools, or bots. Editor names are self-declared by the software, so this is a self-identified rung."
      />
      <p className="dim sans">Counts use the current collection method only. Earliest displayed changeset date: {byDay.find((d) => d.sampled > 0)?.day ?? "not yet available"}; earlier overlapping samples are excluded.</p>
      <StatTiles
        tiles={[
          { value: any ? fmtInt(summary.ai7d) : "–", label: "AI-assisted or bot changesets, 7 days", sub: `${fmtInt(summary.sampled7d)} changesets sampled` },
          { value: fmtPct(share), label: "share of sampled changesets" },
          { value: summary.byEditor[0] ? summary.byEditor[0].editor : "–", label: "most common AI-assisted editor, 30 days", sub: summary.byEditor[0] ? `${fmtInt(summary.byEditor[0].c)} changesets` : undefined },
        ]}
      />
      {!any ? (
        <Empty db={db}>No observations are available from the current collection method yet. Earlier overlapping samples are excluded from these totals.</Empty>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, margin: "0 0 28px" }}>
            <MiniChart days={byDay.map((d) => d.day)} values={byDay.map((d) => d.ai)} label="AI-assisted changesets per day" />
            <MiniChart days={byDay.map((d) => d.day)} values={byDay.map((d) => d.sampled)} label="Changesets sampled per day" />
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                By kind · 30 days
              </div>
              <BarList rows={summary.byKind.map((k) => ({ key: k.kind, label: KIND_LABEL[k.kind] ?? k.kind, value: k.c }))} variant="neutral" />
            </div>
          </div>
          <div className="label" style={{ marginBottom: 8 }}>
            Editors · 30 days
          </div>
          <BarList rows={summary.byEditor.map((e) => ({ key: e.editor, label: e.editor, value: e.c }))} />
          <div className="label" style={{ margin: "28px 0 8px" }}>
            Recent AI-assisted changesets
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Closed (UTC)</th>
                  <th>Editor</th>
                  <th>User</th>
                  <th>Comment</th>
                  <th className="num">Changes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="mono dim" title={relTime(r.ts)}>
                      {fmtStamp(r.ts)}
                    </td>
                    <td className="mono">{r.editor}</td>
                    <td>{r.user ?? "–"}</td>
                    <td>
                      <a href={r.url}>{r.comment ?? `changeset ${r.id}`}</a>
                    </td>
                    <td className="num">{r.changes !== null ? fmtInt(r.changes) : "–"}</td>
                    <td>
                      <SaveButton item={{ id: `map-${r.id}`, kind: "map changeset", title: r.comment ?? `changeset ${r.id}`, url: r.url, sub: `${r.editor} · ${fmtDay(r.ts.toISOString().slice(0, 10))}` }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
