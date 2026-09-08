"use client";

import { useEffect, useState } from "react";

import { canonicalSavedId, readSaved, writeSaved, subscribeSaved, type SavedItem } from "./saved-storage";
export { readSaved, writeSaved, type SavedItem } from "./saved-storage";

/** Bookmark toggle. Saved items live only in this browser (localStorage). */
export function SaveButton({ item }: { item: Omit<SavedItem, "savedAt"> }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const sync = () => setSaved(readSaved().some((s) => s.id === canonicalSavedId(item.id)));
    sync();
    return subscribeSaved(sync);
  }, [item.id]);

  const toggle = () => {
    const cur = readSaved();
    if (cur.some((s) => s.id === canonicalSavedId(item.id))) writeSaved(cur.filter((s) => s.id !== canonicalSavedId(item.id)));
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
