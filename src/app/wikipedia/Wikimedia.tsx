import { MiniChart } from "@/components/charts";
import { SaveButton } from "@/components/SaveButton";
import { Empty } from "@/components/ui";
import { fmtDay, fmtInt, fmtStamp } from "@/lib/format";
import { WIKI_PROJECTS } from "@/lib/ingest/wikimedia";
import { getCommonsUploads, getWikidataBotEdits, getWikimediaProjects } from "@/lib/stats-sources";

const commonsUrl = (title: string) => `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`;

export async function Wikimedia({ db }: { db: boolean }) {
  const [projects, wikidata, commons] = await Promise.all([getWikimediaProjects(14), getWikidataBotEdits(20), getCommonsUploads(20)]);
  const rows = WIKI_PROJECTS.map((p) => {
    const series = projects[p.key] ?? [];
    const latest = [...series].reverse().find((d) => d.total !== null);
    return { ...p, latest };
  });
  if (rows.every((r) => !r.latest) && wikidata.rows.length === 0 && commons.rows.length === 0) {
    return <Empty db={db}>The Wikimedia-wide poller runs with every ingest cycle; the metrics API lags about two days.</Empty>;
  }
  return (
    <>
      <p className="label" style={{ marginBottom: 8 }}>
        Bot share of edits per project · latest available day (Wikimedia metrics API)
      </p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Project</th>
              <th>Day</th>
              <th className="num">All edits</th>
              <th className="num">Bot edits</th>
              <th className="num">Bot share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.latest?.total ?? null;
              const bot = r.latest?.bot ?? null;
              return (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="dim">{r.latest ? fmtDay(r.latest.day) : "–"}</td>
                  <td className="num">{total !== null ? fmtInt(total) : "–"}</td>
                  <td className="num">{bot !== null ? fmtInt(bot) : "–"}</td>
                  <td className="num">{total && bot !== null ? `${((bot / total) * 100).toFixed(0)}%` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dim sans" style={{ fontSize: 12.5, margin: "8px 0 24px" }}>
        Registered bots are mostly classic scripts, not language models. Shown as automation volume for context; not counted as AI activity.
      </p>

      <div className="section-head">
        <h2>Agent-like Wikidata bots</h2>
        <a className="more" href="https://www.wikidata.org/wiki/User:SpinachBot">
          SpinachBot ↗
        </a>
      </div>
      <p className="page-sub">Bots on Wikidata that answer requests in natural language rather than run fixed scripts. {fmtInt(wikidata.last30d)} edits in 30 days.</p>
      {wikidata.rows.length === 0 ? (
        <p className="empty">No recent edits recorded.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Bot</th>
                <th>Page</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {wikidata.rows.map((r) => (
                <tr key={r.revid}>
                  <td className="mono dim">{fmtStamp(r.ts)}</td>
                  <td className="mono">{r.user}</td>
                  <td>
                    <a href={`https://www.wikidata.org/w/index.php?diff=prev&oldid=${r.revid}`}>{r.title}</a>
                  </td>
                  <td className="dim">{r.comment?.slice(0, 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-head">
        <h2>AI-generated media on Commons</h2>
        <a className="more" href="https://commons.wikimedia.org/wiki/Category:AI-generated_images">
          category ↗
        </a>
      </div>
      <p className="page-sub">Files that Commons editors placed in the AI-generated categories. A human-curated label: high precision, unknown recall. {fmtInt(commons.last30d)} uploads in 30 days.</p>
      {commons.byDay.some((d) => d.c > 0) ? <MiniChart days={commons.byDay.map((d) => d.day)} values={commons.byDay.map((d) => d.c)} label="AI-generated uploads per day" /> : null}
      {commons.rows.length > 0 ? (
        <div className="tbl-wrap" style={{ marginTop: 12 }}>
          <table className="tbl">
            <tbody>
              {commons.rows.map((r) => (
                <tr key={r.pageid}>
                  <td className="mono dim">{fmtStamp(r.ts)}</td>
                  <td>
                    <a href={commonsUrl(r.title)}>{r.title.replace(/^File:/, "")}</a>
                  </td>
                  <td className="dim">{r.category}</td>
                  <td>
                    <SaveButton item={{ id: `commons-${r.pageid}`, kind: "commons upload", title: r.title, url: commonsUrl(r.title) }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
