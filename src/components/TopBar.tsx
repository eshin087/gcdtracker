"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS, SITE } from "@/lib/site";
import { LivePill } from "./LivePill";

export function TopBar() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="topbar">
      <div className="shell topbar-inner">
        <Link href="/" className="wordmark" aria-label={`${SITE.name} home`}>
          {SITE.name}
        </Link>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <LivePill />
      </div>
    </header>
  );
}
