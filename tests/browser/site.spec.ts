import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const routes = ["/demo", "/", "/traffic", "/visitors", "/visitors/agents", "/visitors/recent", "/visitors/violations", "/wikipedia", "/wikipedia/edits", "/wikipedia/edits/1", "/wikipedia/editors", "/wikipedia/wikimedia", "/github", "/github/day", "/github/agents", "/github/prs", "/github/watched", "/github/signals", "/github/signals/confirmed", "/maps", "/forums", "/forums/posts", "/forums/guestbook", "/tooling", "/new-agents", "/before-after", "/agents", "/agents/gptbot", "/investigations", "/methods", "/data", "/saved"];
const malformed = ["/not-a-page", "/wikipedia/edits/all/1/extra", "/wikipedia/edits/all/1e2", "/wikipedia/edits/all/501", "/wikipedia/editors/extra", "/visitors/recent/extra", "/github/signals/invalid", "/forums/posts/extra", "/agents/signed%3Auntrusted.example"];

test("primary and nested routes render without client errors", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && /hydration|did not match|Minified React error/.test(message.text())) errors.push(message.text()); });
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    expect(response?.status(), route).toBe(200);
    expect(await response!.text(), route + " serialized response").not.toContain("PRIVATE_QA_SENTINEL");
    await expect(page.locator("main h1"), route).toBeVisible();
    expect(await page.locator("body").innerText(), route).not.toContain("PRIVATE_QA_SENTINEL");
    await expect(page.getByText("Data is temporarily unavailable", { exact: true }), route).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("invalid routes return 404 instead of aliases", async ({ request }) => {
  for (const route of malformed) expect((await request.get(route)).status(), route).toBe(404);
});

test("Research disclosure supports clicks, keyboard and focus return", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Research" });
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".menu-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.locator(".menu-panel a").first()).toBeFocused();
  await page.locator(".menu-panel").getByRole("link", { name: /Wikipedia/ }).click();
  await expect(page).toHaveURL(/\/wikipedia$/);
  await expect(page.getByRole("button", { name: "Research" })).toHaveAttribute("aria-expanded", "false");
});

test("view controls navigate and expose the active view", async ({ page }) => {
  await page.goto("/github/day");
  const views = page.getByRole("navigation", { name: "GitHub views" });
  await views.getByRole("link", { name: "By agent" }).click();
  await expect(page).toHaveURL(/\/github\/agents$/);
  await expect(views.getByRole("link", { name: "By agent" })).toHaveAttribute("aria-current", "page");
  await page.goto("/wikipedia/edits");
  await page.getByRole("navigation", { name: "Confidence tier" }).getByRole("link", { name: "Filter-flagged" }).click();
  await expect(page).toHaveURL(/\/wikipedia\/edits\/1$/);
});

test("saved evidence recovers corrupt entries and synchronizes between tabs", async ({ page, context }) => {
  await page.goto("/saved");
  await page.evaluate(() => localStorage.setItem("gcd:saved", '[null,{}, {"id":"bad"}]'));
  await page.reload();
  await expect(page.getByText("Nothing saved yet.")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/saved");
  await page.goto("/");
  const save = page.locator(".records .record").first().getByRole("button");
  await expect(save).toBeVisible();
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await expect(other.locator(".records .record")).toHaveCount(1);
  await other.getByRole("button", { name: /^Remove .+ from saved$/ }).click();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await page.goto("/saved");
  await page.evaluate(() => localStorage.setItem("gcd:saved", JSON.stringify([
    { id: "osm-123", kind: "map", title: "Migrated map record", url: "https://example.org/record", savedAt: "2026-09-01T00:00:00Z" },
    { id: "map-123", kind: "map", title: "Duplicate map record", url: "https://example.org/record", savedAt: "2026-09-01T00:00:00Z" },
  ])));
  await page.reload();
  await expect(page.locator(".records .record")).toHaveCount(1);
  await expect(page.getByText("Migrated map record", { exact: true })).toBeVisible();
  await other.close();
});

for (const width of [390, 768, 1024, 1440]) {
  test("responsive layouts at " + width + "px", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/demo", "/", "/traffic", "/github", "/wikipedia", "/methods", "/data", "/tooling", "/agents", "/maps", "/new-agents", "/github/watched", "/github/signals", "/investigations"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      expect(size.document, route + " document width").toBeLessThanOrEqual(size.viewport + 1);
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(colorScheme + " theme and reduced-motion screenshots", async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "networkidle" });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await expect(page.locator("animateMotion")).toHaveCount(0);
    await expect(page.locator("main h1")).toBeVisible();
    await mkdir(".qa/screenshots", { recursive: true });
    await page.screenshot({ path: ".qa/screenshots/home-" + colorScheme + "-390.png", fullPage: true });
    for (const route of ["/demo", "/maps", "/new-agents", "/github/watched", "/github/signals", "/investigations"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("main h1")).toBeVisible();
      const size = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      expect(size.document, route).toBeLessThanOrEqual(size.viewport + 1);
      await page.screenshot({ path: ".qa/screenshots/" + route.slice(1).replaceAll("/", "-") + "-" + colorScheme + "-390.png", fullPage: true });
    }
  });
}

test("public APIs and exports omit private fixture fields", async ({ request }) => {
  for (const path of ["/api/export/visits.csv", "/api/export/guestbook.json", "/api/export/radar.json", "/api/guestbook"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("PRIVATE_QA_SENTINEL");
    expect(body).not.toMatch(/ip_prefix|ipHash|ip_hash|signature_agent|signatureAgent|referer/);
  }
  const live = await request.get("/api/live");
  expect(live.status()).toBe(200);
  const health = await live.json();
  expect(health.status).toMatch(/^(live|stale|offline|degraded)$/);
  expect(health).not.toHaveProperty("aiVisits24h");
  expect(health).not.toHaveProperty("lastAiVisit");
});

test("research flow pauses all motion and honors reduced-motion preferences", async ({ page, browser, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/investigations", { waitUntil: "networkidle" });
  await expect(page.locator(".flow animateMotion").first()).toBeAttached();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".flow animateMotion")).toHaveCount(0);
  const ticker = page.locator(".flow-ticker .label");
  const paused = (await ticker.textContent()) ?? "";
  await page.waitForTimeout(4200);
  await expect(ticker).toHaveText(paused);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(ticker).not.toHaveText(paused);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".flow animateMotion").first()).toBeAttached();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".flow animateMotion")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Motion off", exact: true })).toBeDisabled();
  const reduced = (await ticker.textContent()) ?? "";
  await page.waitForTimeout(4200);
  await expect(ticker).toHaveText(reduced);
  const initialContext = await browser.newContext({ baseURL, javaScriptEnabled: false, reducedMotion: "reduce", extraHTTPHeaders: { Purpose: "prefetch" } });
  try {
    const initial = await initialContext.newPage();
    await initial.goto("/investigations");
    await expect(initial.locator(".flow-dot").first()).toBeAttached();
    await expect(initial.locator(".flow-dot").first()).toBeHidden();
  } finally { await initialContext.close(); }
});