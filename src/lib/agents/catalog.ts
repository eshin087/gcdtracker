import aiRobots from "../../../data/ai-robots.json";
import { CATEGORY_OVERRIDES, DROP_TOKENS } from "./overrides";
import type { AgentDef, Category, IpSource, RobotsRespect } from "./types";

/**
 * Published IP-range lists. All of them share the shape
 * `{ creationTime, prefixes: [{ ipv4Prefix } | { ipv6Prefix }] }`.
 */
export const IP_SOURCES: IpSource[] = [
  { key: "openai-gptbot", operator: "OpenAI", url: "https://openai.com/gptbot.json" },
  { key: "openai-searchbot", operator: "OpenAI", url: "https://openai.com/searchbot.json" },
  { key: "openai-chatgpt-user", operator: "OpenAI", url: "https://openai.com/chatgpt-user.json" },
  { key: "openai-adsbot", operator: "OpenAI", url: "https://openai.com/adsbot.json" },
  {
    key: "anthropic",
    operator: "Anthropic",
    url: "https://claude.com/crawling/bots.json",
    note: "One flat list for ClaudeBot, Claude-User and Claude-SearchBot.",
  },
  { key: "perplexity-bot", operator: "Perplexity", url: "https://www.perplexity.com/perplexitybot.json" },
  { key: "perplexity-user", operator: "Perplexity", url: "https://www.perplexity.com/perplexity-user.json" },
  {
    key: "google-common",
    operator: "Google",
    url: "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
  },
  {
    key: "google-agents",
    operator: "Google",
    url: "https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json",
  },
  {
    key: "google-fetchers",
    operator: "Google",
    url: "https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers.json",
  },
  {
    key: "google-googlebot",
    operator: "Google",
    url: "https://developers.google.com/static/search/apis/ipranges/googlebot.json",
  },
  { key: "apple", operator: "Apple", url: "http://search.developer.apple.com/applebot.json" },
  { key: "commoncrawl", operator: "Common Crawl", url: "https://index.commoncrawl.org/ccbot.json" },
  { key: "mistral-index", operator: "Mistral AI", url: "https://mistral.ai/mistralai-index-ips.json" },
  { key: "mistral-user", operator: "Mistral AI", url: "https://mistral.ai/mistralai-user-ips.json" },
  { key: "duckduckgo", operator: "DuckDuckGo", url: "https://duckduckgo.com/duckassistbot.json" },
];

const c = (
  slug: string,
  name: string,
  operator: string,
  category: Category,
  tokens: string[],
  extra: Partial<Omit<AgentDef, "slug" | "name" | "operator" | "category" | "tokens" | "source">> = {},
): AgentDef => ({ slug, name, operator, category, tokens, robots: "unknown", source: "curated", ...extra });

/** Curated, vendor-documented agents (verified against vendor docs on 2026-09-06). */
export const CURATED: AgentDef[] = [
  // ---- OpenAI
  c("gptbot", "GPTBot", "OpenAI", "ai-training-crawler", ["GPTBot"], {
    ipSource: "openai-gptbot",
    robots: "yes",
    docs: "https://developers.openai.com/api/docs/bots",
    description: "OpenAI's training crawler.",
  }),
  c("oai-searchbot", "OAI-SearchBot", "OpenAI", "ai-search-index", ["OAI-SearchBot"], {
    ipSource: "openai-searchbot",
    robots: "yes",
    docs: "https://developers.openai.com/api/docs/bots",
    description: "Builds the index behind ChatGPT search results.",
  }),
  c("chatgpt-user", "ChatGPT-User", "OpenAI", "ai-user-fetch", ["ChatGPT-User"], {
    ipSource: "openai-chatgpt-user",
    robots: "partial",
    docs: "https://developers.openai.com/api/docs/bots",
    description: "Fetches a page because a ChatGPT user asked about it. OpenAI says robots.txt rules may not apply.",
  }),
  c("oai-adsbot", "OAI-AdsBot", "OpenAI", "ai-tooling", ["OAI-AdsBot"], {
    ipSource: "openai-adsbot",
    docs: "https://developers.openai.com/api/docs/bots",
    description: "Checks landing pages for ads shown in ChatGPT.",
  }),
  c("chatgpt-agent", "ChatGPT agent", "OpenAI", "ai-browsing-agent", ["ChatGPT Agent", "ChatGPT-Agent"], {
    robots: "no",
    description: "ChatGPT's browsing agent. Signs requests with Web Bot Auth (Signature-Agent: chatgpt.com).",
  }),

  // ---- Anthropic
  c("claudebot", "ClaudeBot", "Anthropic", "ai-training-crawler", ["ClaudeBot"], {
    ipSource: "anthropic",
    robots: "yes",
    docs: "https://support.claude.com/en/articles/8896518",
    description: "Anthropic's training crawler.",
  }),
  c("claude-user", "Claude-User", "Anthropic", "ai-user-fetch", ["Claude-User"], {
    ipSource: "anthropic",
    robots: "yes",
    docs: "https://support.claude.com/en/articles/8896518",
    description: "Fetches a page because a Claude user asked about it.",
  }),
  c("claude-searchbot", "Claude-SearchBot", "Anthropic", "ai-search-index", ["Claude-SearchBot"], {
    ipSource: "anthropic",
    robots: "yes",
    docs: "https://support.claude.com/en/articles/8896518",
    description: "Improves Claude's search results.",
  }),
  c("claude-code", "Claude Code", "Anthropic", "ai-coding-agent", ["Claude-Code"], {
    description: "Coding agent fetching pages during a task.",
  }),
  c("anthropic-legacy", "anthropic-ai / Claude-Web (legacy)", "Anthropic", "ai-training-crawler", ["anthropic-ai", "Claude-Web"], {
    controlTokenOnly: true,
    description: "Legacy robots.txt names; not seen as live user agents.",
  }),

  // ---- Perplexity
  c("perplexitybot", "PerplexityBot", "Perplexity", "ai-search-index", ["PerplexityBot"], {
    ipSource: "perplexity-bot",
    robots: "yes",
    docs: "https://docs.perplexity.ai/guides/bots",
    description: "Indexes pages for Perplexity answers. Perplexity states it is not used for training.",
  }),
  c("perplexity-user", "Perplexity-User", "Perplexity", "ai-user-fetch", ["Perplexity-User"], {
    ipSource: "perplexity-user",
    robots: "no",
    docs: "https://docs.perplexity.ai/guides/bots",
    description: "Fetches a page on a user's behalf. Perplexity says it generally ignores robots.txt.",
  }),

  // ---- Google
  c("google-extended", "Google-Extended", "Google", "ai-training-crawler", ["Google-Extended"], {
    controlTokenOnly: true,
    robots: "yes",
    docs: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    description: "robots.txt control token for Gemini training and grounding. Never appears as a live user agent.",
  }),
  c("googleother", "GoogleOther", "Google", "ai-tooling", [], {
    prefixTokens: ["GoogleOther"],
    ipSource: "google-common",
    robots: "yes",
    docs: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    description: "Generic crawler used by Google product teams for research and development, including AI.",
  }),
  c("google-cloudvertexbot", "Google-CloudVertexBot", "Google", "ai-tooling", ["Google-CloudVertexBot"], {
    ipSource: "google-common",
    robots: "yes",
    docs: "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers",
    description: "Crawls on behalf of Vertex AI Agent Builder customers.",
  }),
  c("google-agent", "Google-Agent", "Google", "ai-browsing-agent", ["Google-Agent"], {
    ipSource: "google-agents",
    robots: "no",
    docs: "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers",
    description: "Google's browsing agent (added March 2026). Ignores robots.txt by design.",
  }),
  c("google-geminino", "Google-GeminiNotebook", "Google", "ai-user-fetch", ["Google-GeminiNotebook", "Google-NotebookLM"], {
    ipSource: "google-fetchers",
    robots: "no",
    docs: "https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers",
    description: "Fetches sources a NotebookLM / Gemini user added.",
  }),
  c("googleagent-legacy", "GoogleAgent-Mariner / URLContext", "Google", "ai-browsing-agent", ["GoogleAgent-Mariner", "GoogleAgent-URLContext"], {
    robots: "no",
    description: "Earlier agent tokens; likely superseded by Google-Agent.",
  }),
  c("gemini-deep-research", "Gemini Deep Research", "Google", "ai-user-fetch", ["Gemini-Deep-Research"], {
    robots: "no",
    description: "Fetches pages during a Gemini Deep Research run.",
  }),
  c("google-gemini-cli", "Gemini CLI", "Google", "ai-coding-agent", ["Google-Gemini-CLI"]),
  c("googlebot", "Googlebot", "Google", "search-engine", ["Googlebot"], {
    ipSource: "google-googlebot",
    robots: "yes",
    description: "Classic web search crawler. Not counted as AI.",
  }),

  // ---- Apple
  c("applebot", "Applebot", "Apple", "search-engine", ["Applebot"], {
    ipSource: "apple",
    rdns: [".applebot.apple.com"],
    robots: "yes",
    docs: "https://support.apple.com/en-us/119829",
    description: "Powers Siri and Spotlight search. Apple may also use it for training unless Applebot-Extended is disallowed.",
  }),
  c("applebot-extended", "Applebot-Extended", "Apple", "ai-training-crawler", ["Applebot-Extended"], {
    controlTokenOnly: true,
    robots: "yes",
    description: "robots.txt control token for Apple model training. Never appears as a live user agent.",
  }),

  // ---- Meta
  c("meta-externalagent", "Meta-ExternalAgent", "Meta", "ai-training-crawler", ["meta-externalagent"], {
    robots: "yes",
    docs: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
    description: "Training and indexing crawler. Meta publishes no IP ranges, so it cannot be verified.",
  }),
  c("meta-externalfetcher", "Meta-ExternalFetcher", "Meta", "ai-user-fetch", ["meta-externalfetcher"], {
    robots: "partial",
    docs: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
    description: "User-triggered fetch for Meta AI. May bypass robots.txt.",
  }),
  c("meta-webindexer", "Meta-WebIndexer", "Meta", "ai-search-index", ["meta-webindexer"], {
    robots: "yes",
    docs: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
    description: "Index behind Meta AI search.",
  }),
  c("facebookbot", "FacebookBot", "Meta", "ai-training-crawler", ["FacebookBot"], {
    robots: "yes",
    description: "Older Meta crawler used to improve language models.",
  }),

  // ---- Amazon
  c("amazonbot", "Amazonbot", "Amazon", "ai-training-crawler", ["Amazonbot"], {
    robots: "yes",
    docs: "https://developer.amazon.com/amazonbot",
    description: "Improves Alexa and trains Amazon models. IP list is published as an HTML page.",
  }),
  c("amzn-searchbot", "Amzn-SearchBot", "Amazon", "ai-search-index", ["Amzn-SearchBot"], {
    robots: "yes",
    docs: "https://developer.amazon.com/amazonbot",
  }),
  c("amzn-user", "Amzn-User", "Amazon", "ai-user-fetch", ["Amzn-User"], {
    robots: "yes",
    docs: "https://developer.amazon.com/amazonbot",
    description: "Live fetch on behalf of an Alexa user.",
  }),
  c("novaact", "Nova Act", "Amazon", "ai-browsing-agent", ["NovaAct"], { robots: "unknown" }),
  c("amazon-buy-for-me", "Buy For Me", "Amazon", "ai-browsing-agent", ["AmazonBuyForMe"], { robots: "unknown" }),

  // ---- Mistral
  c("mistral-training", "MistralAI-Training", "Mistral AI", "ai-training-crawler", ["MistralAI-Training"], {
    robots: "yes",
    docs: "https://docs.mistral.ai/robots",
  }),
  c("mistral-index", "MistralAI-Index", "Mistral AI", "ai-search-index", ["MistralAI-Index"], {
    ipSource: "mistral-index",
    robots: "yes",
    docs: "https://docs.mistral.ai/robots",
  }),
  c("mistral-user", "MistralAI-User", "Mistral AI", "ai-user-fetch", ["MistralAI-User"], {
    ipSource: "mistral-user",
    robots: "yes",
    docs: "https://docs.mistral.ai/robots",
  }),

  // ---- Common Crawl
  c("ccbot", "CCBot", "Common Crawl", "ai-training-crawler", ["CCBot"], {
    ipSource: "commoncrawl",
    rdns: [".crawl.commoncrawl.org"],
    robots: "yes",
    docs: "https://commoncrawl.org/ccbot",
    description: "Open crawl dataset that feeds many model training runs.",
  }),

  // ---- DuckDuckGo / Microsoft
  c("duckassistbot", "DuckAssistBot", "DuckDuckGo", "ai-user-fetch", ["DuckAssistBot"], {
    ipSource: "duckduckgo",
    robots: "yes",
  }),
  c("duckduckbot", "DuckDuckBot", "DuckDuckGo", "search-engine", ["DuckDuckBot"], { robots: "yes" }),
  c("bingbot", "Bingbot", "Microsoft", "search-engine", ["bingbot"], {
    rdns: [".search.msn.com"],
    robots: "yes",
    description: "Bing's crawler; the same index grounds Copilot answers. Not counted as AI.",
  }),

  // ---- ByteDance / Chinese vendors
  c("bytespider", "Bytespider", "ByteDance", "ai-training-crawler", ["Bytespider"], {
    robots: "no",
    description: "Widely reported to ignore robots.txt.",
  }),
  c("tiktokspider", "TikTokSpider", "ByteDance", "ai-training-crawler", ["TikTokSpider"]),
  c("deepseekbot", "DeepSeekBot", "DeepSeek", "ai-training-crawler", ["DeepSeekBot"]),
  c("kimibot", "KimiBot", "Moonshot AI", "ai-training-crawler", ["KimiBot"]),
  c("kimi-user", "Kimi-User", "Moonshot AI", "ai-user-fetch", ["Kimi-User"]),
  c("kimi-searchbot", "Kimi-SearchBot", "Moonshot AI", "ai-search-index", ["Kimi-SearchBot"]),
  c("tongyibot", "TongyiBot", "Alibaba", "ai-training-crawler", ["TongyiBot"]),
  c("yiyanbot", "YiyanBot", "Baidu", "ai-training-crawler", ["YiyanBot"]),
  c("pangubot", "PanguBot", "Huawei", "ai-training-crawler", ["PanguBot"]),
  c("petalbot", "PetalBot", "Huawei", "ai-search-index", ["PetalBot"], { robots: "yes" }),
  c("yandex-additional", "YandexAdditional", "Yandex", "ai-training-crawler", ["YandexAdditional", "YandexAdditionalBot"], {
    description: "Feeds YandexGPT.",
  }),
  c("yandexbot", "YandexBot", "Yandex", "search-engine", ["YandexBot"], { robots: "yes" }),
  c("baiduspider", "Baiduspider", "Baidu", "search-engine", ["Baiduspider"], { robots: "yes" }),

  // ---- Other model vendors / data
  c("cohere", "cohere-ai", "Cohere", "ai-training-crawler", ["cohere-ai", "cohere-training-data-crawler"]),
  c("ai2bot", "AI2Bot", "Allen Institute for AI", "ai-training-crawler", ["AI2Bot", "Ai2Bot-Dolma"], { robots: "yes" }),
  c("timpibot", "Timpibot", "Timpi", "ai-search-index", ["Timpibot"]),
  c("youbot", "YouBot", "You.com", "ai-search-index", ["YouBot"], { robots: "yes" }),
  c("omgili", "omgili / webz.io", "Webz.io", "ai-training-crawler", ["omgili", "omgilibot"], {
    description: "Sells crawled data, including to model trainers.",
  }),

  // ---- Browsing agents
  c("manus", "Manus", "Butterfly Effect", "ai-browsing-agent", ["Manus-User"], { robots: "unknown" }),
  c("devin", "Devin", "Cognition", "ai-browsing-agent", ["Devin"], { robots: "unknown" }),
  c("twinagent", "TwinAgent", "Twin", "ai-browsing-agent", ["TwinAgent"]),
  c("lightpanda", "Lightpanda", "Lightpanda", "ai-browsing-agent", ["Lightpanda"], {
    description: "Headless browser built for AI agents.",
  }),

  // ---- Coding agents
  c("cursor", "Cursor", "Anysphere", "ai-coding-agent", ["Cursor"]),
  c("opencode", "opencode", "SST", "ai-coding-agent", ["opencode"]),
  c("trae", "Trae", "ByteDance", "ai-coding-agent", ["Trae"]),

  // ---- Tooling / data providers
  c("firecrawl", "Firecrawl", "Firecrawl", "ai-tooling", ["FirecrawlAgent"]),
  c("exa", "Exa", "Exa", "ai-search-index", ["ExaBot", "ExaSearchBot"]),
  c("tavily", "Tavily", "Tavily", "ai-tooling", ["TavilyBot"]),
  c("crawl4ai", "Crawl4AI", "Crawl4AI", "ai-tooling", ["Crawl4AI"]),
  c("diffbot", "Diffbot", "Diffbot", "ai-tooling", ["Diffbot"], { robots: "partial" }),
  c("diffbot-user", "Diffbot-User", "Diffbot", "ai-user-fetch", ["Diffbot-User"]),
  c("brightbot", "Brightbot", "Bright Data", "ai-tooling", ["Brightbot"]),
  c("apifybot", "ApifyBot", "Apify", "ai-tooling", ["ApifyBot"]),
  c("imagesiftbot", "ImagesiftBot", "Hive", "ai-tooling", ["ImagesiftBot"]),
  c("img2dataset", "img2dataset", "various", "ai-training-crawler", ["img2dataset"]),

  // ---- Explicit non-AI bots (keep the AI share honest)
  c("slurp", "Yahoo Slurp", "Yahoo", "search-engine", ["Slurp"], { robots: "yes" }),
  c("link-previewers", "Link previewers", "various", "other-bot", [
    "facebookexternalhit",
    "Twitterbot",
    "LinkedInBot",
    "Slackbot",
    "Discordbot",
    "TelegramBot",
    "WhatsApp",
    "Embedly",
  ]),
  c("seo-crawlers", "SEO crawlers", "various", "other-bot", [
    "AhrefsBot",
    "SemrushBot",
    "MJ12bot",
    "DotBot",
    "DataForSeoBot",
    "BLEXBot",
  ]),
  c("monitors", "Uptime monitors & platform bots", "various", "other-bot", [
    "UptimeRobot",
    "Pingdom",
    "vercel-screenshot",
    "Vercelbot",
    "Lighthouse",
    "Chrome-Lighthouse",
    "PageSpeed",
  ]),
];

type RawAgent = { operator?: string; respect?: string; function?: string; frequency?: string; description?: string };

function categoryFromFunction(fn: string | undefined): Category {
  const f = (fn ?? "").toLowerCase();
  if (/coding agent/.test(f)) return "ai-coding-agent";
  if (/\bagents?\b/.test(f) && !/search/.test(f)) return "ai-browsing-agent";
  if (/assistant/.test(f) || /user-initiated|user prompts|user queries/.test(f)) return "ai-user-fetch";
  if (/search/.test(f)) return "ai-search-index";
  if (/scrap|train|dataset|llm|language model|machine learning|crawler/.test(f)) return "ai-training-crawler";
  return "ai-tooling";
}

function robotsFromRespect(r: string | undefined): RobotsRespect {
  const s = (r ?? "").toLowerCase();
  if (s.startsWith("yes") || s.startsWith("[yes]")) return "yes";
  if (s.startsWith("no") || s.startsWith("[no]")) return "no";
  return "unknown";
}

export function slugify(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLongTail(): AgentDef[] {
  const curatedTokens = new Set<string>();
  for (const d of CURATED) {
    for (const t of d.tokens) curatedTokens.add(t.toLowerCase());
    for (const t of d.prefixTokens ?? []) curatedTokens.add(t.toLowerCase());
  }
  const curatedSlugs = new Set(CURATED.map((d) => d.slug));
  const seen = new Set<string>();
  const out: AgentDef[] = [];
  const raw = aiRobots.agents as Record<string, RawAgent>;
  for (const [token, info] of Object.entries(raw)) {
    if (DROP_TOKENS.has(token)) continue;
    const key = token.toLowerCase();
    if (curatedTokens.has(key) || seen.has(key)) continue;
    seen.add(key);
    let slug = slugify(token);
    if (curatedSlugs.has(slug) || out.some((d) => d.slug === slug)) slug = `${slug}-lt`;
    const override = CATEGORY_OVERRIDES[token];
    out.push({
      slug,
      name: token,
      operator: info.operator && !/unclear/i.test(info.operator) ? info.operator : "Unknown operator",
      category: override ?? categoryFromFunction(info.function),
      tokens: [token],
      robots: robotsFromRespect(info.respect),
      description: info.description,
      docs: aiRobots.source,
      source: "ai-robots-txt",
    });
  }
  return out;
}

export const LONG_TAIL: AgentDef[] = buildLongTail();

/** Every known agent definition, curated first. */
export const CATALOG: AgentDef[] = [...CURATED, ...LONG_TAIL];

const BY_SLUG = new Map(CATALOG.map((d) => [d.slug, d]));

export function findAgent(slug: string): AgentDef | undefined {
  return BY_SLUG.get(slug);
}

export function ipSourceFor(key: string): IpSource | undefined {
  return IP_SOURCES.find((s) => s.key === key);
}
