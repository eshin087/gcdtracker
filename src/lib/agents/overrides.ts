import type { Category } from "./types";

/**
 * Corrections applied to the long-tail list vendored from ai.robots.txt
 * (data/ai-robots.json). Curated entries in catalog.ts always win by token;
 * these overrides handle list entries that are wrong for our purposes.
 */

/** Tokens dropped entirely: too generic to match safely, or not AI. */
export const DROP_TOKENS = new Set<string>([
  "Operator", // plain English word; the OpenAI Operator product is retired
  "Spider", // generic; collides with any "Spider/1.0" hobby crawler
  "Scrapy", // generic scraping framework, not an AI operator
  "Code", // far too generic ("VS Code", "Code/1.0")
  "LCC", // three letters, no boundary safety
  "YaK", // plain word
  "Applebot", // curated as a search engine
  "Applebot-Extended", // curated as a control token
  "YandexAdditional", // curated
  "YandexAdditionalBot", // curated
  "GoogleOther-Image", // covered by the curated GoogleOther prefix
  "GoogleOther-Video",
  "Brightbot 1.0", // versioned duplicates of tokens already present
  "iaskspider/2.0",
  "MistralAI-User/1.0",
  "quillbot.com",
  "panscient.com",
]);

/** Category overrides by token (case-insensitive) for long-tail entries. */
export const CATEGORY_OVERRIDES: Record<string, Category> = {
  Devin: "ai-browsing-agent",
  "Claude-Code": "ai-coding-agent",
  Cursor: "ai-coding-agent",
  opencode: "ai-coding-agent",
  Trae: "ai-coding-agent",
  "Google-Gemini-CLI": "ai-coding-agent",
  Lightpanda: "ai-browsing-agent",
  ImagesiftBot: "ai-tooling",
  img2dataset: "ai-training-crawler",
  Diffbot: "ai-tooling",
  "Diffbot-User": "ai-user-fetch",
  FirecrawlAgent: "ai-tooling",
  TavilyBot: "ai-tooling",
  Crawl4AI: "ai-tooling",
  ExaBot: "ai-search-index",
  ExaSearchBot: "ai-search-index",
};
