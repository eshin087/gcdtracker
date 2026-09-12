import { expect, test } from "@playwright/test";
import { BLUESKY_SCOPE, MASTODON_ORIGINS } from "../../src/lib/social-contract";
import { mkdir } from "node:fs/promises";

function clientErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|did not match|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("social demo distinguishes missing samples, observed zero and ordinary automation", async ({ page }) => {
  const errors = clientErrors(page);
  await page.goto("/demo", { waitUntil: "networkidle" });
  const social = page.locator("#ai-publishing");
  await expect(social).toContainText("Synthetic social samples for this preview.");
  await expect(social.locator(".social-cell")).toHaveCount(56);
  await social.locator(".social-cell.missing").first().click();
  await expect(social.locator(".social-inspector")).toContainText("No sample is available");
  const zero = social.locator('.social-cell:not(.missing)[aria-label*="0.00% of"]').first();
  await zero.click();
  await expect(social.locator(".social-inspector")).toContainText("0 English AI disclosure text matches");
  await expect(social.locator(".social-inspector")).not.toContainText("No sample is available");
  await social.locator(".social-cell.partial").first().click();
  await expect(social.locator(".social-inspector")).toContainText("Partial collection");
  await social.getByRole("combobox").selectOption("automation");
  await expect(social.locator(".social-map-row").first().locator(".social-cell.missing")).toHaveCount(28);
  await expect(social.locator(".social-map-row").first().locator('[aria-label*="bot status not measured"]').first()).toBeVisible();
  await social.locator(".social-map-row").nth(1).locator(".social-cell:not(.missing)").first().click();
  await expect(social.locator(".social-inspector")).toContainText("self-designated bot accounts");
  await social.getByRole("combobox").selectOption("sample");
  await expect(social.locator('.social-cell[aria-label*="posts sampled"]').first()).toBeVisible();
  await expect(social).toContainText("The two signals may overlap and must not be added");
  expect(errors).toEqual([]);
});

test("social heatmap supports keyboard inspection and links reading and publishing separately", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  const social = page.locator("#ai-publishing"), row = social.locator(".social-map-row").first();
  const first = row.locator("button").first(), next = row.locator("button").nth(1);
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(next).toBeFocused();
  await expect(next).toHaveAttribute("aria-pressed", "true");
  const label = await next.getAttribute("aria-label");
  const date = label!.match(/\d{4}-\d{2}-\d{2}/)![0];
  await expect(social.locator(".social-inspector")).toContainText(date);
  await page.keyboard.press("End");
  await expect(row.locator("button").last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await social.getByRole("link", { name: "Coverage and methods →", exact: true }).click();
  await expect(page).toHaveURL(/\/social$/);
  await expect(page.getByRole("heading", { name: "Social publishing", exact: true })).toBeVisible();
  await expect(page.locator("#social-coverage")).toContainText("does not mean full-day or full-platform coverage");
  await page.locator("#ai-publishing").getByRole("link", { name: "AI reading", exact: true }).click();
  await expect(page).toHaveURL(/\/traffic$/);
  await expect(page.locator("#ai-reading")).toBeVisible();
});

test("reading demo displays source coverage and leaves missing days as graph gaps", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  const reading = page.locator("#ai-reading");
  await expect(reading).toContainText("Synthetic preview");
  await expect(reading).toContainText("27/28 days");
  await expect(reading).toContainText("1 missing or incomplete days");
  await expect(reading).not.toContainText("A complete source window");
  const paths = await reading.locator(".series path").evaluateAll(nodes => nodes.map(node => node.getAttribute("d") ?? ""));
  expect(paths).toHaveLength(3);
  for (const path of paths) expect((path.match(/M/g) ?? []).length).toBeGreaterThan(1);
});

for (const width of [390, 768, 1024, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`social and reading reports fit ${width}px ${colorScheme} with reduced motion`, async ({ page }) => {
      const errors = clientErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      for (const route of ["/demo", "/social"]) {
        const response = await page.goto(route, { waitUntil: "networkidle" });
        expect(response?.status()).toBe(200);
        await expect(page.locator("#ai-publishing")).toBeVisible();
        await expect(page.locator("#ai-publishing").getByRole("combobox")).toBeVisible();
        const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(bounds.document, `${route} ${width} ${colorScheme}`).toBeLessThanOrEqual(bounds.viewport + 1);
        await expect(page.locator("animateMotion")).toHaveCount(0);
        expect(await page.locator("body").innerText()).not.toContain("PRIVATE_QA_SENTINEL");
        if (route === "/demo" && [390, 1440].includes(width)) {
          await mkdir(".qa/screenshots", { recursive: true });
          await page.locator("#ai-publishing").screenshot({ path: `.qa/screenshots/social-demo-${colorScheme}-${width}.png` });
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test("social export exposes bounded sample coverage and omits private fixture details", async ({ request }) => {
  const response = await request.get("/api/export/social_samples.json");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  const text = await response.text();
  expect(text).not.toContain("PRIVATE_QA_SENTINEL");
  expect(text).not.toContain("qa-private-marker");
  const data = JSON.parse(text);
  expect(data.mode).toBe("observed");
  expect(data.days).toHaveLength(28);
  expect(data.methodology).toContain("unverified");
  expect(data.samples.length).toBeGreaterThan(0);
  expect(data.samples.length).toBeLessThanOrEqual(56);
  const allowedScopes = [BLUESKY_SCOPE, ...MASTODON_ORIGINS];
  for (const sample of data.samples) {
    expect(["bluesky", "mastodon"]).toContain(sample.platform);
    expect(sample.collectionVersion).toBe(1);
    expect(sample.sampledPosts).toBeGreaterThan(0);
    expect(sample.aiDisclosurePosts).toBeLessThanOrEqual(sample.sampledPosts);
    if (sample.platform === "bluesky") expect(sample.automatedAccountPosts).toBeNull();
    else expect(sample.automatedAccountPosts).toBeLessThanOrEqual(sample.sampledPosts);
    expect(data.days).toContain(sample.day);
    expect(["success", "partial"]).toContain(sample.outcome);
    expect(sample.coverage.maxRequests).toBeLessThanOrEqual(2);
    expect(sample.coverage.maxRecords).toBeLessThanOrEqual(300);
    for (const scope of sample.scopes) expect(allowedScopes).toContain(scope);
    for (const key of ["cursor", "revision", "rawPost", "postBody", "accountId", "userId", "model"]) expect(sample).not.toHaveProperty(key);
    for (const key of ["rawBody", "cursor", "token"]) expect(sample.coverage).not.toHaveProperty(key);
    for (const scope of sample.coverage.scopes) {
      expect(allowedScopes).toContain(scope.scope);
      expect(["success", "failed"]).toContain(scope.outcome);
      expect(scope).not.toHaveProperty("rawAccount");
    }
  }
});

