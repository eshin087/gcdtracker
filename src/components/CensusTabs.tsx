"use client";

import { type KeyboardEvent, type ReactNode, useId, useState } from "react";

export interface CensusTab {
  id: string;
  label: string;
  panel: ReactNode;
}

/**
 * Three census figures in one block. Every panel is server-rendered and stays in the
 * HTML; switching only toggles the `hidden` attribute, so no request and no layout shift.
 */
export function CensusTabs({ tabs, label }: { tabs: CensusTab[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const base = useId();

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === active);
    if (i === -1) return;
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next === -1) return;
    e.preventDefault();
    setActive(tabs[next].id);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next] ?? null)?.focus();
  };

  return (
    <div className="census-tabs">
      <div role="tablist" aria-label={label} className="seg" onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={t.id !== active}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
