import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const label = process.argv[2] ?? "current";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Use a simple measurement label");
const url = process.env.QA_SITE_URL ?? "http://127.0.0.1:3100";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) throw new Error("Measure the local seeded fixture only");
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce", extraHTTPHeaders: { Purpose: "prefetch" } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) throw new Error("Homepage failed: " + response?.status());
  const html = await response.text();
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      domElements: document.querySelectorAll("*").length,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      encodedHtmlBytes: nav.encodedBodySize,
      transferredHtmlBytes: nav.transferSize,
      timeToFirstByteMs: Math.round(nav.responseStart),
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      fontPreloads: document.querySelectorAll('link[rel="preload"][as="font"]').length,
      resources: performance.getEntriesByType("resource").length,
    };
  });
  const report = { label, url, viewport: "1440x1000", measuredAt: new Date().toISOString(), decodedHtmlBytes: Buffer.byteLength(html), cache: response.headers()["x-nextjs-cache"] ?? null, ...metrics, errors };
  await mkdir(".qa/screenshots", { recursive: true });
  await page.screenshot({ path: ".qa/screenshots/" + label + "-home-1440.png", fullPage: true });
  await writeFile(".qa/" + label + "-home-metrics.json", JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
} finally { await browser.close(); }
