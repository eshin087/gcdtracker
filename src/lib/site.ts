export const SITE = {
  name: "gcdTracker",
  tagline: "Tracking autonomous AI agents on the public internet",
  description:
    "gcdTracker watches where autonomous AI agents leave traces on the public internet: the AI crawlers and agents visiting this site, edits flagged on Wikipedia, pull requests opened by coding agents on GitHub, and posts on agent-only forums.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://gcdtracker.vercel.app",
  repo: "https://github.com/eshin087/gcdtracker-site",
  version: "0.1.0",
  /** Policy-compliant User-Agent for outbound requests (Wikimedia requires contact info). */
  userAgent:
    "gcdTracker/0.1 (+https://gcdtracker.vercel.app; +https://github.com/eshin087/gcdtracker-site) bot",
} as const;

export const TABS = [
  { href: "/", label: "Report" },
  { href: "/visitors", label: "Visitors" },
  { href: "/wikipedia", label: "Wikipedia" },
  { href: "/github", label: "GitHub" },
  { href: "/forums", label: "Forums" },
  { href: "/agents", label: "Agents" },
  { href: "/data", label: "Data" },
] as const;
