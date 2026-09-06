"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isGroup, NAV, SITE } from "@/lib/site";
import { LivePill } from "./LivePill";

function active(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="wordmark" aria-label={`${SITE.name} home`}>
          {SITE.name}
        </Link>
        <nav className="tabs" aria-label="Sections">
          {NAV.map((entry) =>
            isGroup(entry) ? (
              <div className="menu" key={entry.label} ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
                <button
                  type="button"
                  className="menu-btn"
                  aria-haspopup="menu"
                  aria-expanded={open}
                  aria-current={entry.items.some((i) => active(pathname, i.href)) ? "page" : undefined}
                  onClick={() => setOpen((o) => !o)}
                >
                  {entry.label} <span aria-hidden="true">▾</span>
                </button>
                {open ? (
                  <div className="menu-panel" role="menu">
                    {entry.items.map((i) => (
                      <Link key={i.href} href={i.href} role="menuitem" aria-current={active(pathname, i.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                        <span className="menu-label">{i.label}</span>
                        {i.blurb ? <span className="menu-blurb">{i.blurb}</span> : null}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <Link key={entry.href} href={entry.href} aria-current={active(pathname, entry.href) ? "page" : undefined}>
                {entry.label}
              </Link>
            ),
          )}
        </nav>
        <LivePill />
      </div>
    </header>
  );
}
