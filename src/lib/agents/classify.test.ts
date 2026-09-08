import { describe, expect, it } from "vitest";
import { CATALOG, CURATED, LONG_TAIL } from "./catalog";
import { classify, classifyUA, signatureAgentHost } from "./classify";

const UA = {
  gptbot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)",
  chatgptUser: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
  searchbot: "Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)",
  claudebot: "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  claudeUser: "Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  claudeSearch: "Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)",
  perplexityBot: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  perplexityUser: "Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
  googlebot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  googleAgent: "Mozilla/5.0 (compatible; Google-Agent/1.0; +https://developers.google.com/search/docs/crawling-indexing/google-user-triggered-fetchers)",
  googleOtherImage: "GoogleOther-Image/1.0",
  applebot: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  bytespider: "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)",
  ccbot: "CCBot/2.0 (https://commoncrawl.org/faq/)",
  metaAgent: "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  metaFetcher: "meta-externalfetcher/1.1",
  fbHit: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  curl: "curl/8.4.0",
  python: "python-requests/2.31.0",
  addsearch: "Mozilla/5.0 (compatible; AddSearchBot/1.0; +https://www.addsearch.com/bot)",
};

describe("classifyUA", () => {
  it("matches every curated token to its own definition", () => {
    for (const def of CURATED) {
      for (const token of def.tokens) {
        const m = classifyUA(`Mozilla/5.0 (compatible; ${token}/1.0; +https://example.com/bot)`);
        expect(m.def?.slug, token).toBe(def.slug);
      }
      for (const token of def.prefixTokens ?? []) {
        const m = classifyUA(`${token}-Video/1.0`);
        expect(m.def?.slug, token).toBe(def.slug);
      }
    }
  });

  it("matches every long-tail token", () => {
    for (const def of LONG_TAIL) {
      const m = classifyUA(`Mozilla/5.0 (compatible; ${def.tokens[0]}; +https://example.com)`);
      expect(m.def, def.tokens[0]).not.toBeNull();
    }
  });

  it("keeps sibling tokens apart", () => {
    expect(classifyUA(UA.gptbot).def?.slug).toBe("gptbot");
    expect(classifyUA(UA.chatgptUser).def?.slug).toBe("chatgpt-user");
    expect(classifyUA(UA.searchbot).def?.slug).toBe("oai-searchbot");
    expect(classifyUA(UA.claudebot).def?.slug).toBe("claudebot");
    expect(classifyUA(UA.claudeUser).def?.slug).toBe("claude-user");
    expect(classifyUA(UA.claudeSearch).def?.slug).toBe("claude-searchbot");
    expect(classifyUA(UA.perplexityBot).def?.slug).toBe("perplexitybot");
    expect(classifyUA(UA.perplexityUser).def?.slug).toBe("perplexity-user");
    expect(classifyUA(UA.metaAgent).def?.slug).toBe("meta-externalagent");
    expect(classifyUA(UA.metaFetcher).def?.slug).toBe("meta-externalfetcher");
  });

  it("never counts classic search engines or previewers as AI", () => {
    expect(classifyUA(UA.googlebot).category).toBe("search-engine");
    expect(classifyUA(UA.googlebot).def?.slug).toBe("googlebot");
    expect(classifyUA(UA.applebot).def?.slug).toBe("applebot");
    expect(classifyUA(UA.applebot).category).toBe("search-engine");
    expect(classifyUA(UA.fbHit).category).toBe("other-bot");
  });

  it("handles agents, prefixes and the long tail", () => {
    expect(classifyUA(UA.googleAgent).def?.slug).toBe("google-agent");
    expect(classifyUA(UA.googleAgent).category).toBe("ai-browsing-agent");
    expect(classifyUA(UA.googleOtherImage).def?.slug).toBe("googleother");
    expect(classifyUA(UA.bytespider).def?.slug).toBe("bytespider");
    expect(classifyUA(UA.ccbot).def?.slug).toBe("ccbot");
    const lt = classifyUA(UA.addsearch);
    expect(lt.def?.source).toBe("ai-robots-txt");
    expect(lt.category).toBe("ai-search-index");
  });

  it("treats real browsers as human and scripts as other bots", () => {
    for (const ua of [UA.chrome, UA.safariIos, UA.firefox, UA.edge]) {
      expect(classifyUA(ua).category, ua).toBe("human");
      expect(classifyUA(ua).def, ua).toBeNull();
    }
    expect(classifyUA(UA.curl).category).toBe("other-bot");
    expect(classifyUA(UA.python).category).toBe("other-bot");
    expect(classifyUA("").category).toBe("other-bot");
    expect(classifyUA(null).category).toBe("other-bot");
  });

  it("does not let generic words in browser UAs trigger matches", () => {
    // "Cursor" and "Devin" are catalog tokens; they must not match inside other words.
    expect(classifyUA("Mozilla/5.0 (compatible; Precursor/1.0)").def).toBeNull();
    expect(classifyUA("Mozilla/5.0 (compatible; Devinci/1.0)").def).toBeNull();
    expect(classifyUA("Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0 Safari/537.36 Cursor/1.2").def?.slug).toBe("cursor");
  });
});

describe("classify with headers", () => {
  it("detects Web Bot Auth headers on a catalogued agent", () => {
    const headers = (n: string) =>
      ({
        "signature-agent": '"https://chatgpt.com"',
        "signature-input": 'sig1=("@authority" "signature-agent");keyid="x";tag="web-bot-auth"',
        signature: "sig1=:abc:",
      })[n] ?? null;
    const c = classify("Mozilla/5.0 (compatible; ChatGPT-User/1.0)", headers);
    expect(c.slug).toBe("chatgpt-user");
    expect(c.signed).toBe(true);
    expect(c.signatureAgent).toBe("chatgpt.com");
  });

  it("does not promote an unknown UA based on unverified signature headers", () => {
    const headers = (n: string) =>
      ({
        "signature-agent": '"https://agent.example.org"',
        "signature-input": "sig1=(...)",
        signature: "sig1=:abc:",
      })[n] ?? null;
    const c = classify(UA.chrome, headers);
    expect(c.slug).toBeNull();
    expect(c.name).toBeNull();
    expect(c.category).toBe("human");
    expect(c.signed).toBe(true);
    expect(c.signatureStatus).toBe("unverified");
  });

  it("requires all three headers before calling a request signed", () => {
    const headers = (n: string) => (n === "signature-agent" ? '"https://chatgpt.com"' : null);
    const c = classify(UA.chrome, headers);
    expect(c.signed).toBe(false);
    expect(c.signatureStatus).toBe("absent");
    expect(c.category).toBe("human");
  });

  it("parses Signature-Agent values", () => {
    expect(signatureAgentHost('"https://chatgpt.com"')).toBe("chatgpt.com");
    expect(signatureAgentHost("https://example.com/path")).toBe("example.com");
    expect(signatureAgentHost(null)).toBeNull();
    expect(signatureAgentHost("not a URL")).toBeNull();
    expect(signatureAgentHost("http://example.com")).toBeNull();
    expect(signatureAgentHost("https://user:password@example.com")).toBeNull();
    expect(signatureAgentHost("javascript:alert(1)")).toBeNull();
  });
});

describe("catalog integrity", () => {
  it("has unique slugs and tokens", () => {
    const slugs = new Set<string>();
    const tokens = new Set<string>();
    for (const d of CATALOG) {
      expect(slugs.has(d.slug), `dup slug ${d.slug}`).toBe(false);
      slugs.add(d.slug);
      for (const t of [...d.tokens, ...(d.prefixTokens ?? [])]) {
        const k = t.toLowerCase();
        expect(tokens.has(k), `dup token ${t}`).toBe(false);
        tokens.add(k);
      }
    }
  });

  it("includes the long tail", () => {
    expect(LONG_TAIL.length).toBeGreaterThan(60);
  });
});
