export type Category =
  | "ai-training-crawler"
  | "ai-search-index"
  | "ai-user-fetch"
  | "ai-browsing-agent"
  | "ai-coding-agent"
  | "ai-tooling"
  | "search-engine"
  | "other-bot"
  | "human";

export const AI_CATEGORIES = [
  "ai-training-crawler",
  "ai-search-index",
  "ai-user-fetch",
  "ai-browsing-agent",
  "ai-coding-agent",
  "ai-tooling",
] as const satisfies readonly Category[];

export const ALL_CATEGORIES = [
  ...AI_CATEGORIES,
  "search-engine",
  "other-bot",
  "human",
] as const satisfies readonly Category[];

export function isAiCategory(c: Category): boolean {
  return (AI_CATEGORIES as readonly Category[]).includes(c);
}

export const CATEGORY_LABELS: Record<Category, string> = {
  "ai-training-crawler": "Training crawler",
  "ai-search-index": "AI search index",
  "ai-user-fetch": "User-triggered fetch",
  "ai-browsing-agent": "Browsing agent",
  "ai-coding-agent": "Coding agent",
  "ai-tooling": "AI tooling / data provider",
  "search-engine": "Search engine",
  "other-bot": "Other bot",
  human: "Browser-like / unidentified",
};

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  "ai-training-crawler": "Broad crawls that build training corpora or datasets for models.",
  "ai-search-index": "Crawls that build an index used to ground AI answers with citations.",
  "ai-user-fetch": "A person asked an assistant something and it fetched this page in response.",
  "ai-browsing-agent": "An autonomous agent driving a browser or fetcher to complete a task.",
  "ai-coding-agent": "Coding assistants and agents fetching documentation or pages.",
  "ai-tooling": "Scrapers, readers and data providers that feed AI products.",
  "search-engine": "Classic search-engine crawlers. Not counted as AI.",
  "other-bot": "Monitors, link previewers, SEO crawlers, scripts. Not counted as AI.",
  human: "Requests without a recognized automation signal; may include people or undeclared agents.",
};

export type RobotsRespect = "yes" | "no" | "partial" | "unknown";

export interface AgentDef {
  slug: string;
  name: string;
  operator: string;
  category: Category;
  /** exact tokens matched with word boundaries (case-insensitive) */
  tokens: string[];
  /** tokens matched as prefixes (e.g. GoogleOther-Image) */
  prefixTokens?: string[];
  /** key into IP_SOURCES for IP verification */
  ipSource?: string;
  /** reverse-DNS suffixes that verify the operator (v2) */
  rdns?: string[];
  robots: RobotsRespect;
  /** robots.txt control token only; never appears in live traffic */
  controlTokenOnly?: boolean;
  docs?: string;
  description?: string;
  source: "curated" | "ai-robots-txt";
}

export interface IpSource {
  key: string;
  operator: string;
  url: string;
  note?: string;
}
