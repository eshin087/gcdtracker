export const SITE = {
  name: "gcdTracker",
  tagline: "Tracking AI traffic and agent activity on the public internet",
  description:
    "gcdTracker watches where autonomous AI agents leave traces on the public internet: published crawler-traffic measurements, edits flagged on Wikipedia and across Wikimedia, pull requests opened by coding agents on GitHub, AI-assisted map edits, platform-reported forum posts, and the growth of agent tooling.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gcdtracker.vercel.app",
  repo: "https://github.com/eshin087/gcdtracker",
  version: "0.3.0",
  /** Policy-compliant User-Agent for outbound requests (Wikimedia requires contact info). */
  userAgent:
    "gcdTracker/0.3 (+https://gcdtracker.vercel.app; +https://github.com/eshin087/gcdtracker) bot",
} as const;

export interface NavLink {
  href: string;
  label: string;
  /** short line for menus and llms.txt */
  blurb?: string;
}
export interface NavGroup {
  label: string;
  items: NavLink[];
}
export type NavEntry = NavLink | NavGroup;

export const SOURCES: NavLink[] = [
  { href: "/wikipedia", label: "Wikipedia & Wikimedia", blurb: "edits flagged as AI on Wikipedia; bot volume across Wikimedia; AI-generated media on Commons" },
  { href: "/github", label: "GitHub", blurb: "pull requests by coding agents, watched repositories, self-disclosure signals" },
  { href: "/maps", label: "Maps", blurb: "AI-assisted and bot edits to OpenStreetMap" },
  { href: "/forums", label: "Forums", blurb: "public posts and platform-reported accounts on Moltbook" },
  { href: "/tooling", label: "Tooling", blurb: "MCP registry growth, AI-attributed commits, coding agents on Hugging Face" },
  { href: "/new-agents", label: "New agents", blurb: "newly published crawler tokens and agents listed in the signing registry" },
];

export const NAV: NavEntry[] = [
  { href: "/", label: "Overview" },
  { href: "/traffic", label: "Traffic", blurb: "published traffic measurements and crawler-policy samples" },
  { label: "Research", items: [
    ...SOURCES,
    { href: "/before-after", label: "Before & after", blurb: "long-term trends and their limits" },
    { href: "/agents", label: "Agent directory", blurb: "known user-agent tokens and IP verification" },
    { href: "/investigations", label: "Notes", blurb: "field notes and research briefs" },
  ] },
  { href: "/data", label: "Data", blurb: "downloads, API and collection status" },
  { href: "/methods", label: "Methods", blurb: "measurement definitions and limitations" },
  { href: "/saved", label: "Saved", blurb: "evidence bookmarked in this browser" },
];

export function isGroup(e: NavEntry): e is NavGroup {
  return "items" in e;
}

/** Every page link, flattened (for sitemap and llms.txt). */
export const ALL_LINKS: NavLink[] = NAV.flatMap((e) => (isGroup(e) ? e.items : [e]));
