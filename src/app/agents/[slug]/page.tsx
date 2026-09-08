import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge, PageHeader } from "@/components/ui";
import { findAgent, ipSourceFor } from "@/lib/agents/catalog";
import { CATEGORY_DESCRIPTIONS } from "@/lib/agents/types";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const def = findAgent(slug);
  return { title: def ? def.name : "Agent", description: def?.description ?? "AI agent profile" };
}

export default async function AgentPage({ params }: { params: Params }) {
  const { slug: raw } = await params;
  const slug = raw;
  const def = findAgent(slug);
  if (!def) notFound();

  const source = def?.ipSource ? ipSourceFor(def.ipSource) : undefined;

  const name = def.name;
  const operator = def.operator;
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
            robots.txt policy: {{ yes: "reported to respect", no: "reported noncompliance", partial: "mixed reports", unknown: "unknown" }[def.robots]}
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
          <span className="badge">vendor documents reverse DNS; not checked here ({def.rdns.join(", ")})</span>
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

      <p className="sans dim">This directory documents crawler identity and declared purpose. It does not infer usage, model activity or web-wide volume from visits to gcdTracker.</p>
      <p className="sans"><Link href="/traffic">Explore published crawler traffic →</Link></p>
    </div>
  );
}
