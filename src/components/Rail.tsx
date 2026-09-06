"use client";

import { useEffect, useState } from "react";

export interface RailItem {
  id: string;
  title: string;
  level?: 2 | 3;
}

function List({ items, active }: { items: RailItem[]; active: string | null }) {
  return (
    <ol>
      {items.map((it) => (
        <li key={it.id} className={it.level === 3 ? "sub" : undefined}>
          <a href={`#${it.id}`} className={active === it.id ? "is-active" : undefined}>
            {it.title}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Left "On this page" rail. Highlights the section currently in view. */
export function Rail({ items, title = "On this page" }: { items: RailItem[]; title?: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const headings = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const visible = new Map<string, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size > 0) {
          // topmost visible heading wins
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActive(top);
        } else {
          // nothing visible: pick the last heading above the viewport
          let last: string | null = null;
          for (const h of headings) {
            if (h.getBoundingClientRect().top < 100) last = h.id;
          }
          if (last) setActive(last);
        }
      },
      { rootMargin: "-72px 0px -60% 0px", threshold: 0 },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items]);

  return (
    <aside className="rail">
      <div className="rail-sticky hidden lg:block">
        <p className="rail-title">{title}</p>
        <List items={items} active={active} />
      </div>
      <details className="lg:hidden">
        <summary>{title}</summary>
        <List items={items} active={active} />
      </details>
    </aside>
  );
}
