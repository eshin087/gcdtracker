import { expect, test, type Locator, type Page } from "@playwright/test";
import { BLUESKY_SCOPE, MASTODON_ORIGINS } from "../../src/lib/social-contract";
import { mkdir } from "node:fs/promises";

const modes = ["Contributions", "Social publishing", "Web crawling"] as const;

function clientErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /hydration|did not match|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function selectMode(flow: Locator, name: typeof modes[number]) {
  const tab = flow.getByRole("tab", { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(flow.getByRole("tabpanel")).toHaveCount(1);
  await expect(flow.locator("svg.flow-svg")).toHaveCount(1);
}

test("one homepage flow separates contributions, social samples and crawler shares", async ({ page }) => {
  const errors = clientErrors(page);
  await page.goto("/demo", { waitUntil: "networkidle" });
  const flow = page.locator("#flow");
  await expect(flow.getByRole("tablist", { name: "Activity mode", exact: true })).toBeVisible();
  await expect(flow.getByRole("tab")).toHaveCount(3);
  await expect(flow.getByRole("tab", { name: "Contributions", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(flow.locator(".flow-link")).toHaveCount(8);
  await expect(page.locator("#ai-publishing, #ai-reading, .social-cell")).toHaveCount(0);
  await expect(page.locator("#activity-heatmap svg.heatmap")).toHaveCount(1);
  await expect(page.locator("#census svg.multiline")).toHaveCount(1);

  await selectMode(flow, "Social publishing");
  await expect(flow.locator(".flow")).toHaveAttribute("data-mode", "demo");
  await expect(flow.locator(".flow-link")).toHaveCount(4);
  const destinations = flow.getByRole("group", { name: "Filter destinations", exact: true });
  await expect(destinations.getByRole("button", { name: "Bluesky", exact: true })).toBeVisible();
  await expect(destinations.getByRole("button", { name: "Mastodon", exact: true })).toBeVisible();
  // The latest platform samples are 228 and 57 posts, not sums of overlapping snapshots.
  await expect(flow.locator("svg.flow-svg")).toContainText("228");
  await expect(flow.locator("svg.flow-svg")).toContainText("57");
  await expect(flow.locator("svg.flow-svg")).not.toContainText("% share");
  const evidence = flow.getByRole("region", { name: "Source evidence and coverage", exact: true });
  await expect(evidence).toContainText(/unverified/i);
  await flow.getByLabel("Inspect source", { exact: true }).selectOption({ label: "Bluesky · disclosure matches" });
  const observedValue = evidence.locator("dl > div").filter({ has: page.locator("dt", { hasText: /^Observed value$/ }) }).locator("dd");
  const destinationValue = evidence.locator("dl > div").filter({ has: page.locator("dt", { hasText: /^Destination$/ }) }).locator("dd");
  await expect(observedValue).toBeVisible();
  await expect(observedValue).toHaveText("6 posts");
  await expect(destinationValue).toBeVisible();
  await expect(destinationValue).toHaveText("Bluesky");
  const details = evidence.locator("details.flow-details");
  const summary = details.locator("summary", { hasText: "Sampling and source details" });
  await expect(details).not.toHaveAttribute("open", "");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(details.getByText("Collection caps", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(details.getByText("Collection caps", { exact: true })).not.toBeVisible();
  const sourceLabels = await flow.getByLabel("Inspect source", { exact: true }).locator("option").allTextContents();
  expect(sourceLabels.join(" ")).not.toMatch(/human|verified author/i);
  await expect(flow.locator(".flow-ticker")).not.toContainText("No recorded examples available");

  await selectMode(flow, "Web crawling");
  await expect(flow.locator(".flow")).toHaveAttribute("data-mode", "demo");
  await expect(flow.locator(".flow-link")).toHaveCount(3);
  await expect(destinations.getByRole("button", { name: "Cloudflare-observed web", exact: true })).toBeVisible();
  await expect(destinations.getByRole("button", { name: "Bluesky", exact: true })).toHaveCount(0);
  await expect(destinations.getByRole("button", { name: "Mastodon", exact: true })).toHaveCount(0);
  await expect(flow.locator("svg.flow-svg")).toContainText("% share");
  await expect(flow.locator("svg.flow-svg")).toContainText("35.2");
  await expect(flow.locator("svg.flow-svg")).toContainText("22.8");
  await expect(flow.locator("svg.flow-svg")).not.toContainText("posts");
  await expect(flow).not.toContainText("requests per day");
  await expect(evidence).toContainText(/Cloudflare/i);
  await flow.getByLabel("Inspect source", { exact: true }).selectOption({ label: "Search indexing" });
  await expect(observedValue).toBeVisible();
  await expect(observedValue).toHaveText("35.2% share");
  await expect(destinationValue).toBeVisible();
  await expect(destinationValue).toHaveText("Cloudflare-observed web");
  expect(errors).toEqual([]);
});

test("activity mode tabs support keyboard navigation and reset destination filters", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  const flow = page.locator("#flow");
  const contributions = flow.getByRole("tab", { name: "Contributions", exact: true });
  const social = flow.getByRole("tab", { name: "Social publishing", exact: true });
  const crawling = flow.getByRole("tab", { name: "Web crawling", exact: true });
  await contributions.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(crawling).toBeFocused();
  await expect(crawling).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(contributions).toBeFocused();
  await expect(contributions).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(crawling).toBeFocused();
  await page.keyboard.press("Home");
  await expect(contributions).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(social).toBeFocused();
  await expect(social).toHaveAttribute("aria-selected", "true");
  await expect(flow.getByRole("tab", { selected: false }).first()).toHaveAttribute("tabindex", "-1");

  await flow.getByRole("button", { name: "Bluesky", exact: true }).click();
  await expect(flow.getByRole("button", { name: "Bluesky", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(flow.locator(".flow-link")).toHaveCount(2);
  await selectMode(flow, "Contributions");
  await expect(flow.getByRole("button", { name: "All destinations", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(flow.locator(".flow-link")).toHaveCount(8);
  await selectMode(flow, "Social publishing");
  await expect(flow.getByRole("button", { name: "All destinations", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(flow.locator(".flow-link")).toHaveCount(4);
  await flow.getByLabel("Inspect source", { exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(flow.getByLabel("Inspect source", { exact: true })).toBeFocused();
});

test("all activity modes can pause animation and honor reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/demo", { waitUntil: "networkidle" });
  const flow = page.locator("#flow");
  for (const mode of modes) {
    await selectMode(flow, mode);
    await expect(flow.locator("animateMotion").first()).toBeAttached();
    await flow.getByRole("button", { name: "Pause", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(flow.locator("animateMotion")).toHaveCount(0);
    await flow.getByRole("button", { name: "Play", exact: true }).click();
    await expect(flow.locator("animateMotion").first()).toBeAttached();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const mode of modes) {
    await selectMode(flow, mode);
    await expect(flow.locator("animateMotion")).toHaveCount(0);
    await expect(flow.getByRole("button", { name: "Motion off", exact: true })).toBeDisabled();
  }
});

test("source pages retain publishing evidence and the detailed crawler line report", async ({ page }) => {
  const errors = clientErrors(page);
  await page.goto("/social", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Social publishing", exact: true })).toBeVisible();
  await expect(page.locator("#ai-publishing svg.flow-svg")).toHaveCount(1);
  await expect(page.locator(".social-cell")).toHaveCount(0);
  await expect(page.locator("#social-coverage")).toContainText("does not mean full-day or full-platform coverage");
  await expect(page.locator("#social-coverage")).toContainText("snapshots can overlap across days");
  await expect(page.locator("#social-coverage").getByRole("link", { name: /Download.*JSON/ })).toHaveAttribute("href", "/api/export/social_samples.json");
  await page.goto("/traffic", { waitUntil: "networkidle" });
  const reading = page.locator("#ai-reading");
  await expect(reading).toBeVisible();
  await expect(reading).toContainText("27/28 days");
  await expect(reading).toContainText("1 missing or incomplete days");
  const paths = await reading.locator(".series path").evaluateAll(nodes => nodes.map(node => node.getAttribute("d") ?? ""));
  expect(paths).toHaveLength(3);
  for (const path of paths) expect((path.match(/M/g) ?? []).length).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

for (const width of [390, 768, 1024, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`activity modes fit ${width}px ${colorScheme} with reduced motion`, async ({ page }) => {
      const errors = clientErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto("/demo", { waitUntil: "networkidle" });
      const flow = page.locator("#flow");
      for (const mode of modes) {
        await selectMode(flow, mode);
        await expect(flow.getByLabel("Inspect source", { exact: true })).toBeVisible();
        const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(bounds.document, `${mode} ${width} ${colorScheme}`).toBeLessThanOrEqual(bounds.viewport + 1);
        await expect(page.locator("animateMotion")).toHaveCount(0);
        await expect(flow.getByRole("button", { name: "Motion off", exact: true })).toBeDisabled();
        if ([390, 1440].includes(width)) {
          await mkdir(".qa/screenshots", { recursive: true });
          const slug = mode.toLowerCase().replaceAll(" ", "-");
          await flow.screenshot({ path: `.qa/screenshots/flow-${slug}-${colorScheme}-${width}.png` });
        }
      }
      for (const route of ["/social", "/traffic"]) {
        const response = await page.goto(route, { waitUntil: "networkidle" });
        expect(response?.status()).toBe(200);
        await expect(page.locator(route === "/social" ? "#ai-publishing svg.flow-svg" : "#ai-reading")).toBeVisible();
        const bounds = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
        expect(bounds.document, `${route} ${width} ${colorScheme}`).toBeLessThanOrEqual(bounds.viewport + 1);
        await expect(page.locator("animateMotion")).toHaveCount(0);
        expect(await page.locator("body").innerText()).not.toContain("PRIVATE_QA_SENTINEL");
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

