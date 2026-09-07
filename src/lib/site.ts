export const SITE = {
  name: "gcdTracker",
  tagline: "Tracking autonomous AI agents on the public internet",
  description:
    "gcdTracker watches where autonomous AI agents leave traces on the public internet: the AI crawlers and agents visiting this site, edits flagged on Wikipedia and across Wikimedia, pull requests opened by coding agents on GitHub, AI-assisted map edits, posts on agent-only forums, and the growth of agent tooling.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gcdtracker.vercel.app",
  repo: "https://github.com/eshin087/gcdtracker-site",
  version: "0.3.0",
  /** Policy-compliant User-Agent for outbound requests (Wikimedia requires contact info). */
  userAgent:
    "gcdTracker/0.3 (+https://gcdtracker.vercel.app; +https://github.com/eshin087/gcdtracker-site) bot",
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
  { href: "/visitors", label: "Visitors", blurb: "AI crawlers and agents seen on this site, with IP verification and honeypots" },
  { href: "/wikipedia", label: "Wikipedia & Wikimedia", blurb: "edits flagged as AI on Wikipedia; bot volume across Wikimedia; AI-generated media on Commons" },
  { href: "/github", label: "GitHub", blurb: "pull requests by coding agents, watched repositories, self-disclosure signals" },
  { href: "/maps", label: "Maps", blurb: "AI-assisted and bot edits to OpenStreetMap" },
  { href: "/forums", label: "Forums", blurb: "posts on Moltbook, an agent-only social network, and this site's guestbook" },
  { href: "/tooling", label: "Tooling", blurb: "MCP registry growth, AI-attributed commits, coding agents on Hugging Face" },
  { href: "/new-agents", label: "New agents", blurb: "newly published crawler tokens and agents that sign their requests" },
];

export const NAV: NavEntry[] = [
  { href: "/", label: "Report" },
  { label: "Sources", items: SOURCES },
  { href: "/traffic", label: "Traffic", blurb: "how much web traffic is AI, here and internet-wide" },
  { href: "/before-after", label: "Before & after", blurb: "reading, asking, coding and crawling, with a baseline from before AI" },
  { href: "/agents", label: "Agents", blurb: "directory of known agent user-agent tokens and how to verify them" },
  { href: "/investigations", label: "Notes", blurb: "field notes and research briefs" },
  { href: "/saved", label: "Saved", blurb: "evidence you bookmarked in this browser" },
  { href: "/methods", label: "Methods", blurb: "how each sensor works, the confidence ladder, limitations" },
  { href: "/data", label: "Data", blurb: "CSV/JSON exports (CC BY 4.0) and the public API" },
];

export function isGroup(e: NavEntry): e is NavGroup {
  return "items" in e;
}

/** Every page link, flattened (for sitemap and llms.txt). */
export const ALL_LINKS: NavLink[] = NAV.flatMap((e) => (isGroup(e) ? e.items : [e]));

/** @deprecated use ALL_LINKS */
export const TABS = ALL_LINKS;
