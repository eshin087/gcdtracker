import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHit, shouldStoreRaw } from "./hits";

const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function headers(map: Record<string, string>) {
  return (n: string) => map[n.toLowerCase()] ?? null;
}

beforeEach(() => vi.stubEnv("IP_HASH_SECRET", "hit-tests"));
afterEach(() => vi.unstubAllEnvs());

describe("buildHit", () => {
  it("describes an AI crawler visit without keeping the IP", () => {
    const hit = buildHit({
      method: "GET",
      pathname: "/visitors",
      headers: headers({
        "user-agent": GPTBOT,
        "x-forwarded-for": "20.125.66.85, 10.0.0.1",
        "x-vercel-ip-country": "us",
        referer: "https://chatgpt.com/some/path",
      }),
      now: new Date("2026-09-06T10:00:00Z"),
    });
    expect(hit).not.toBeNull();
    expect(hit!.classification.slug).toBe("gptbot");
    expect(hit!.classification.category).toBe("ai-training-crawler");
    expect(hit!.day).toBe("2026-09-06");
    expect(hit!.ipPrefix).toBe("20.125.66.0/24");
    expect(hit!.ipHash).toHaveLength(16);
    expect(hit!.country).toBe("US");
    expect(hit!.referer).toBe("chatgpt.com");
    expect(shouldStoreRaw(hit!)).toBe(true);
  });

  it("counts humans but does not store raw rows for them", () => {
    const hit = buildHit({ method: "GET", pathname: "/", headers: headers({ "user-agent": CHROME }) });
    expect(hit!.classification.category).toBe("human");
    expect(shouldStoreRaw(hit!)).toBe(false);
  });

  it("ignores assets, api, prefetches and human HEAD requests", () => {
    const ua = headers({ "user-agent": CHROME });
    expect(buildHit({ method: "GET", pathname: "/_next/static/x.js", headers: ua })).toBeNull();
    expect(buildHit({ method: "GET", pathname: "/api/live", headers: ua })).toBeNull();
    expect(buildHit({ method: "GET", pathname: "/logo.png", headers: ua })).toBeNull();
    expect(buildHit({ method: "GET", pathname: "/", search: "?_rsc=abc", headers: ua })).toBeNull();
    expect(
      buildHit({ method: "GET", pathname: "/", headers: headers({ "user-agent": CHROME, "next-router-prefetch": "1" }) }),
    ).toBeNull();
    expect(
      buildHit({ method: "GET", pathname: "/", headers: headers({ "user-agent": CHROME, "sec-fetch-dest": "image" }) }),
    ).toBeNull();
    expect(buildHit({ method: "HEAD", pathname: "/", headers: ua })).toBeNull();
    expect(buildHit({ method: "HEAD", pathname: "/", headers: headers({ "user-agent": GPTBOT }) })).not.toBeNull();
  });

  it("keeps robots.txt, llms.txt and honeypot hits", () => {
    const ua = headers({ "user-agent": GPTBOT });
    const robots = buildHit({ method: "GET", pathname: "/robots.txt", headers: ua })!;
    expect(robots.isRobots).toBe(true);
    const llms = buildHit({ method: "GET", pathname: "/llms.txt", headers: headers({ "user-agent": CHROME }) })!;
    expect(llms.isLlms).toBe(true);
    expect(shouldStoreRaw(llms)).toBe(true);
    const trap = buildHit({ method: "GET", pathname: "/trap/f7k2-hidden-footer-link", headers: ua })!;
    expect(trap.isTrap).toBe(true);
    expect(trap.trapToken).toBe("f7k2-hidden-footer-link");
    const priv = buildHit({ method: "GET", pathname: "/private/secret", headers: ua })!;
    expect(priv.trapToken).toBe("private");
  });
});

describe("private request data", () => {
  it.each(["malformed/path?secret=private", "data:text/plain,secret", "file:///private"])("drops invalid or non-web referrer %s", (referer) => {
    expect(buildHit({ method: "GET", pathname: "/", headers: headers({ "user-agent": GPTBOT, referer }) })?.referer).toBeNull();
  });
  it("keeps header-only claims out of AI counters while retaining an unverified observation", () => {
    const hit = buildHit({ method: "GET", pathname: "/", headers: headers({ "user-agent": CHROME, "signature-agent": "https://fake.example", "signature-input": "x", signature: "x" }) })!;
    expect(hit.classification.category).toBe("human");
    expect(hit.classification.slug).toBeNull();
    expect(hit.classification.signatureStatus).toBe("unverified");
    expect(shouldStoreRaw(hit)).toBe(true);
  });
});
