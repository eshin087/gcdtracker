import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MiniChart } from "@/components/charts";
import { CategoryBadge, Empty, PageHeader, StatTiles, VerifiedBadge } from "@/components/ui";
import { findAgent, ipSourceFor } from "@/lib/agents/catalog";
import { CATEGORY_DESCRIPTIONS } from "@/lib/agents/types";
import { fmtDate, fmtInt, fmtPct, fmtStamp, relTime } from "@/lib/format";
import { getAgentDetail, getRecentVisits, hasDatabase } from "@/lib/stats";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const def = findAgent(decodeURIComponent(slug));
  return { title: def ? def.name : "Agent", description: def?.description ?? "AI agent profile" };
}

export default async function AgentPage({ params }: { params: Params }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const def = findAgent(slug);
  const isSigned = slug.startsWith("signed:");
  if (!def && !isSigned) notFound();

  const db = hasDatabase();
  const [detail, recent] = await Promise.all([getAgentDetail(slug, 60), getRecentVisits(25, { slug })]);
  const source = def?.ipSource ? ipSourceFor(def.ipSource) : undefined;
  const decided = detail.verified + detail.unverified;

  const name = def?.name ?? `Signed agent (${slug.slice(7)})`;
  const operator = def?.operator ?? slug.slice(7);
  const category = def?.category ?? "ai-browsing-agent";

  return (
    <div className="shell explorer">
      <p className="sans" style={{ fontSize: 12.5, marginBottom: 12 }}>
        <Link href="/agents" style={{ color: "var(--muted)" }}>
          ← all agents
        </Link>
      </p>
      <PageHeader title={name} sub={def?.description ?? CATEGORY_DESCRIPTIONS[category]} />
      <p className="sans" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 13, marginBottom: 22 }}>
        <span>
          <span className="label">Operator</span> {operator}
        </span>
        <CategoryBadge category={category} />
        {def ? (
          <span className="badge">
            robots.txt: {{ yes: "respects", no: "ignores", partial: "may ignore", unknown: "unknown" }[def.robots]}
          </span>
        ) : null}
        {def?.controlTokenOnly ? <span className="badge warn">control token only</span> : null}
        {source ? (
          <span className="badge ok">
            verifiable via{" "}
            <a href={source.url} className="sans" style={{ color: "inherit" }}>
              published IP ranges
            </a>
          </span>
        ) : def?.rdns?.length ? (
          <span className="badge">verifiable via reverse DNS ({def.rdns.join(", ")})</span>
        ) : (
          <span className="badge">no published IP ranges</span>
        )}
        {def?.docs ? (
          <a href={def.docs} className="sans" style={{ color: "var(--accent-ink)" }}>
            vendor documentation ↗
          </a>
        ) : null}
      </p>
      {def ? (
        <p className="sans" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 24 }}>
          Matches user-agent tokens:{" "}
          {[...def.tokens, ...(def.prefixTokens ?? []).map((t) => `${t}*`)].map((t) => (
            <code key={t} className="mono" style={{ marginRight: 8 }}>
              {t}
            </code>
          ))}
          · source: {def.source === "curated" ? "curated from vendor docs" : "ai.robots.txt list"}
        </p>
      ) : null}

      <StatTiles
        tiles={[
          { value: fmtInt(detail.hits), label: "hits recorded", sub: detail.firstSeen ? `first seen ${fmtDate(detail.firstSeen)}` : "not seen yet" },
          { value: decided > 0 ? fmtPct(detail.verified / decided) : "–", label: "IP-verified share", sub: `${fmtInt(detail.verified)} verified · ${fmtInt(detail.unverified)} outside ranges` },
          { value: fmtInt(detail.signed), label: "signed requests", sub: "Web Bot Auth headers present" },
          { value: fmtInt(detail.violations), label: "robots.txt violations", sub: "honeypot hits" },
        ]}
      />

      {detail.hits === 0 ? (
        <Empty db={db}>This agent has not visited yet. The moment it does, its hits, paths and verification results appear here.</Empty>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24, marginBottom: 28 }}>
            <MiniChart days={detail.byDay.map((d) => d.day)} values={detail.byDay.map((d) => d.hits)} label="Hits per day · 60 days" />
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Most requested paths
              </div>
              <table className="tbl">
                <tbody>
                  {detail.topPaths.map((p) => (
                    <tr key={p.path}>
                      <td className="mono">{p.path}</td>
                      <td className="num">{fmtInt(p.hits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>
                Source countries
              </div>
              <table className="tbl">
                <tbody>
                  {detail.countries.map((c) => (
                    <tr key={c.country}>
                      <td className="mono">{c.country}</td>
                      <td className="num">{fmtInt(c.hits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="label" style={{ marginBottom: 8 }}>
            Recent hits · last seen {relTime(detail.lastSeen)}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When (UTC)</th>
                  <th>Path</th>
                  <th>IP prefix</th>
                  <th>Country</th>
                  <th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="mono dim">{fmtStamp(r.ts)}</td>
                    <td className="mono">
                      {r.path}
                      {r.robotsViolation ? (
                        <>
                          {" "}
                          <span className="badge warn">trap</span>
                        </>
                      ) : null}
                    </td>
                    <td className="mono dim">{r.ipPrefix ?? "–"}</td>
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
        </>
      )}
    </div>
  );
}
