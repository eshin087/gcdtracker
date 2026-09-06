"use client";

import { useEffect, useState } from "react";

export interface SavedItem {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  sub?: string;
  savedAt: string;
}

const KEY = "gcd:saved";

export function readSaved(): SavedItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSaved(items: SavedItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 500)));
    window.dispatchEvent(new Event("gcd:saved-changed"));
  } catch {
    /* storage unavailable */
  }
}

/** Bookmark toggle. Saved items live only in this browser (localStorage). */
export function SaveButton({ item }: { item: Omit<SavedItem, "savedAt"> }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const sync = () => setSaved(readSaved().some((s) => s.id === item.id));
    sync();
    window.addEventListener("gcd:saved-changed", sync);
    return () => window.removeEventListener("gcd:saved-changed", sync);
  }, [item.id]);

  const toggle = () => {
    const cur = readSaved();
    if (cur.some((s) => s.id === item.id)) writeSaved(cur.filter((s) => s.id !== item.id));
    else writeSaved([{ ...item, savedAt: new Date().toISOString() }, ...cur]);
  };

  return (
    <button type="button" className={`save-btn ${saved ? "is-saved" : ""}`} onClick={toggle} aria-pressed={saved} title={saved ? "Remove from saved" : "Save this record"}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{saved ? "Saved" : "Save"}</span>
    </button>
  );
}
