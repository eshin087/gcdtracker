import Link from "next/link";
import type { ReactNode } from "react";
import { CATEGORY_LABELS, isAiCategory, type Category } from "@/lib/agents/types";
import { fmtInt } from "@/lib/format";

/* ---------- stat tiles ---------- */

export interface Tile {
  value: ReactNode;
  label: string;
  sub?: ReactNode;
}

export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="tiles">
      {tiles.map((t, i) => (
        <div className="tile" key={i}>
          <div className="num">{t.value}</div>
          <div className="lbl">{t.label}</div>
          {t.sub ? <div className="sub">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/* ---------- bar list ---------- */

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** optional lighter bar drawn behind the main one (e.g. total requests) */
  secondary?: number;
  href?: string;
  title?: string;
}

export function BarList({
  rows,
  variant = "accent",
  max,
  format = fmtInt,
}: {
  rows: BarRow[];
  variant?: "accent" | "neutral";
  max?: number;
  format?: (n: number) => string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.max(r.value, r.secondary ?? 0)));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.key} title={r.title}>
          <div className="k">{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</div>
          <div className="bar-track">
            {r.secondary !== undefined && r.secondary > 0 ? (
              <div className="bar-fill soft" style={{ width: `${Math.min(100, (r.secondary / top) * 100)}%` }} />
            ) : null}
            <div
              className={`bar-fill ${variant === "neutral" ? "neutral" : ""}`}
              style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, opacity: r.value === 0 ? 0 : 1 }}
            />
          </div>
          <div className="v">{format(r.value)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- segmented control ---------- */

export interface SegOption {
  href: string;
  label: string;
  active: boolean;
}

export function Segmented({ options, label }: { options: SegOption[]; label: string }) {
  return (
    <nav className="seg" aria-label={label}>
      {options.map((o) => (
        <Link key={o.href} href={o.href} aria-current={o.active ? "page" : undefined}>
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

/* ---------- pagination ---------- */

export function Pagination({ page, pages, hrefFor }: { page: number; pages: number; hrefFor: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      {page > 1 ? <Link href={hrefFor(page - 1)}>← newer</Link> : <span aria-disabled="true">← newer</span>}
      <span>
        {page} / {pages}
      </span>
      {page < pages ? <Link href={hrefFor(page + 1)}>older →</Link> : <span aria-disabled="true">older →</span>}
    </div>
  );
}

/* ---------- empty state ---------- */

export function Empty({ db, children }: { db: boolean; children?: ReactNode }) {
  return (
    <div className="empty">
      {db ? (
        <>
          <strong>Nothing recorded yet.</strong>
          <br />
          {children ?? "The sensor is live; data appears here as it arrives."}
        </>
      ) : (
        <>
          <strong>Sensor offline.</strong>
          <br />
          No database is connected to this deployment yet, so nothing can be recorded or shown.
        </>
      )}
    </div>
  );
}

/* ---------- badges ---------- */

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className={`badge ${isAiCategory(category) ? "accent" : ""}`}>{CATEGORY_LABELS[category] ?? category}</span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean | null }) {
  if (verified === true) return <span className="badge ok">verified IP</span>;
  if (verified === false) return <span className="badge warn">IP not in ranges</span>;
  return <span className="badge">unverifiable</span>;
}

export function TierBadge({ tier }: { tier: number }) {
  return tier === 1 ? (
    <span className="badge accent">filter-flagged</span>
  ) : (
    <span className="badge">heuristic</span>
  );
}

/* ---------- page header ---------- */

export function PageHeader({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <>
      <h1 className="page-title">{title}</h1>
      {sub ? <p className="page-sub">{sub}</p> : null}
    </>
  );
}

export function SectionHead({ title, href, more }: { title: string; href?: string; more?: string }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {href ? (
        <Link href={href} className="more">
          {more ?? "see all →"}
        </Link>
      ) : null}
    </div>
  );
}

/* ---------- source card (home dashboard) ---------- */

export interface SourceCardProps {
  title: string;
  what: string;
  rung: string;
  value: ReactNode;
  valueLabel: string;
  href: string;
}

export function SourceCard({ title, what, rung, value, valueLabel, href }: SourceCardProps) {
  return (
    <Link href={href} className="source-card">
      <div className="source-head">
        <span className="source-title">{title}</span>
        <span className="badge">{rung}</span>
      </div>
      <p className="source-what">{what}</p>
      <div className="source-value">
        <span className="num">{value}</span>
        <span className="lbl">{valueLabel}</span>
      </div>
      <span className="source-open">open →</span>
    </Link>
  );
}
