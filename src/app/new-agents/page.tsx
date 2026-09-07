import type { Metadata } from "next";
import { SaveButton } from "@/components/SaveButton";
import { Empty, PageHeader, StatTiles } from "@/components/ui";
import { fmtInt, fmtStamp, relTime } from "@/lib/format";
import { hasDatabase } from "@/lib/stats";
import { getSeries, getSightings } from "@/lib/stats-sources";
import { TimelineChart } from "@/components/charts";
import { fmtMonth } from "@/lib/stats-census";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "New agents",
  description: "Newly published AI crawler tokens and entries in a public signing registry.",
};

export default async function NewAgentsPage() {
  const db = hasDatabase();
  const [{ rows, counts, new30d }, history] = await Promise.all([getSightings(400), getSeries("ai-robots-history")]);
  const perMonth = history["new-tokens"] ?? [];
  const cumulative = perMonth.reduce<number[]>((acc, p) => [...acc, (acc.at(-1) ?? 0) + p.value], []);
  const signed = rows.filter((r) => r.kind === "signature-registry");
  const tokens = rows.filter((r) => r.kind === "ai-robots-txt");

  return (
    <div className="shell explorer">
      <PageHeader
        title="New agents"
        sub="Two public lists are diffed daily: the ai.robots.txt catalogue of AI crawler user agents, and the registry of agents that sign their requests with Web Bot Auth. Anything that appears for the first time is recorded here with the date we first saw it."
      />
      <StatTiles
        tiles={[
          { value: fmtInt(counts["ai-robots-txt"] ?? 0), label: "crawler tokens catalogued", sub: "ai.robots.txt" },
          { value: fmtInt(counts["signature-registry"] ?? 0), label: "signing-registry entries", sub: "Web Bot Auth registry" },
          { value: fmtInt(new30d), label: "crawler tokens first listed in the last 30 days", sub: "dated from the ai.robots.txt git history" },
        ]}
      />
      {perMonth.length > 3 ? (
        <figure className="home-chart">
          <TimelineChart
            days={perMonth.map((p) => `${p.period}-01`)}
            bars={perMonth.map((p) => p.value)}
            barLabel="Crawler tokens first listed, per month"
            line={cumulative}
            lineLabel="Tokens on the list"
            title="New AI crawler identities per month"
            height={220}
            xLabel={fmtMonth}
          />
          <figcaption>
            When each token now on the ai.robots.txt list first appeared in the list&apos;s git history. The list records when maintainers noticed a crawler, which lags
            launches by weeks; the March 2024 bar is the list&apos;s own start. Security teams read this as the number of new bot identities needing rules each month.
          </figcaption>
        </figure>
      ) : null}
      {rows.length === 0 ? (
        <Empty db={db}>The agent watch runs daily.</Empty>
      ) : (
        <>
          <div className="section-head">
            <h2>Signing-registry entries</h2>
            <a className="more" href="https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/">
              about Web Bot Auth ↗
            </a>
          </div>
          <p className="page-sub" style={{ maxWidth: "72ch" }}>
            These registry entries advertise signing keys. Membership does not establish the identity of a visitor here. Signature-header presence is recorded without cryptographic verification.
          </p>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Key directory</th>
                  <th>First seen here</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {signed.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.token}</td>
                    <td className="dim" style={{ fontSize: 12 }}>
                      {r.url ? <a href={r.url}>{r.url.replace("https://", "").slice(0, 70)}</a> : "–"}
                    </td>
                    <td className="dim" title={fmtStamp(r.firstSeen)}>
                      {relTime(r.firstSeen)}
                    </td>
                    <td>
                      <SaveButton item={{ id: `sight-${r.id}`, kind: "signing-registry entry", title: r.token, url: r.url, sub: "Web Bot Auth registry" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-head">
            <h2>Crawler tokens</h2>
            <a className="more" href="https://github.com/ai-robots-txt/ai.robots.txt">
              ai.robots.txt ↗
            </a>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Operator</th>
                  <th>Function</th>
                  <th>First listed</th>
                </tr>
              </thead>
              <tbody>
                {tokens.slice(0, 120).map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.token}</td>
                    <td>{r.operator ?? "–"}</td>
                    <td className="dim">{r.fn?.slice(0, 80) ?? "–"}</td>
                    <td className="dim" title={fmtStamp(r.firstSeen)}>
                      {relTime(r.firstSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="dim sans" style={{ fontSize: 12.5, marginTop: 12 }}>
            The first run records the whole list at once; from then on only genuinely new entries appear with a fresh date.
          </p>
        </>
      )}
    </div>
  );
}
