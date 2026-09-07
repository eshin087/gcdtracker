"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { isGroup, NAV, SITE, type NavGroup } from "@/lib/site";
import { LivePill } from "./LivePill";

function active(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function Disclosure({ entry, pathname }: { entry: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return <div className="menu" ref={ref} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="menu-btn" aria-expanded={open} aria-controls={panelId}
      data-active={entry.items.some((i) => active(pathname, i.href)) || undefined} onClick={() => setOpen((value) => !value)}>
      {entry.label} <span aria-hidden="true">▾</span>
    </button>
    <div className="menu-panel" id={panelId} hidden={!open}>
      {entry.items.map((item) => <Link key={item.href} href={item.href} aria-current={active(pathname, item.href) ? "page" : undefined} onClick={() => setOpen(false)}>
        <span className="menu-label">{item.label}</span>{item.blurb ? <span className="menu-blurb">{item.blurb}</span> : null}
      </Link>)}
    </div>
  </div>;
}

export function TopBar() {
  const pathname = usePathname() ?? "/";
  return <header className="topbar"><div className="shell topbar-inner">
    <Link href="/" className="wordmark" aria-label={SITE.name + " home"}>{SITE.name}</Link>
    <nav className="tabs" aria-label="Sections">{NAV.map((entry) => isGroup(entry)
      ? <Disclosure key={entry.label + pathname} entry={entry} pathname={pathname} />
      : <Link key={entry.href} href={entry.href} aria-current={active(pathname, entry.href) ? "page" : undefined}>{entry.label}</Link>)}</nav>
    <LivePill />
  </div></header>;
}
