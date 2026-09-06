"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readSaved, type SavedItem, writeSaved } from "@/components/SaveButton";
import { relTime } from "@/lib/format";

export function SavedList() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  useEffect(() => {
    const sync = () => setItems(readSaved());
    sync();
    window.addEventListener("gcd:saved-changed", sync);
    return () => window.removeEventListener("gcd:saved-changed", sync);
  }, []);

  if (items === null) return <p className="sans dim">Loading…</p>;
  if (items.length === 0)
    return (
      <div className="empty">
        <strong>Nothing saved yet.</strong>
        <br />
        Use the bookmark icon beside any record on the <Link href="/visitors">Visitors</Link>, <Link href="/github">GitHub</Link>, <Link href="/maps">Maps</Link> or <Link href="/forums">Forums</Link> pages.
      </div>
    );

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gcdtracker-saved.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <p className="sans" style={{ display: "flex", gap: 12, fontSize: 13, marginBottom: 14 }}>
        <span className="dim">{items.length} saved</span>
        <button type="button" className="badge" onClick={exportJson} style={{ cursor: "pointer" }}>
          export JSON
        </button>
        <button type="button" className="badge" onClick={() => writeSaved([])} style={{ cursor: "pointer" }}>
          clear all
        </button>
      </p>
      <div className="records">
        {items.map((it) => (
          <div className="record" key={it.id}>
            <span className="when" title={it.savedAt}>
              {relTime(it.savedAt)}
            </span>
            <span className="what">
              <span className="badge kind">{it.kind}</span>
              {it.url ? <a href={it.url}>{it.title}</a> : it.title}
              {it.sub ? <span className="dim"> · {it.sub}</span> : null}
            </span>
            <button type="button" className="save-btn is-saved" title="Remove" onClick={() => writeSaved(readSaved().filter((s) => s.id !== it.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
