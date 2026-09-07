import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("dashboard demo identifies synthetic data and supports evidence inspection", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  await expect(page.getByText("These numbers and records are synthetic.", {exact:true})).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".flow")).toHaveAttribute("data-mode", "demo");
  await expect(page.locator(".flow-link")).toHaveCount(8);
  await expect(page.getByRole("button", {name:"This website",exact:true})).toHaveCount(0);
  await page.getByLabel("Inspect source", {exact:true}).selectOption("wiki:commons");
  const evidence = page.getByRole("region", {name:"Source evidence and coverage"});
  await expect(evidence).toContainText("Tracked category additions");
  await expect(evidence).toContainText("files");
  await page.getByRole("button", {name:"Maps",exact:true}).click();
  await expect(evidence).toContainText("12/30 UTC dates contain rows");
  await expect(evidence).toContainText("partial");
  await page.getByRole("button", {name:"Forums",exact:true}).click();
  await expect(evidence).toContainText("Stale · failed");
  await page.getByRole("button", {name:"All destinations",exact:true}).click();
  await expect(page.locator(".flow-link")).toHaveCount(8);
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({colorScheme:"light",reducedMotion:"reduce"});
  await page.getByLabel("Inspect source", {exact:true}).selectOption("gh:codex-branch");
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0,0); });
  await page.waitForTimeout(200);
  await mkdir(".qa/screenshots", {recursive:true});
  await page.screenshot({path:".qa/screenshots/dashboard-demo-1440.png",fullPage:true});
});

test("restored homepage flow retains animated paths and keyboard-accessible controls", async ({ page }) => {
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/", {waitUntil:"networkidle"});
  await expect(page.locator("#flow")).toBeVisible();
  await expect(page.locator("#flow animateMotion").first()).toBeAttached();
  const pause = page.locator("#flow").getByRole("button", {name:"Pause",exact:true});
  await pause.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#flow animateMotion")).toHaveCount(0);
  await page.getByLabel("Inspect source", {exact:true}).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Inspect source", {exact:true})).toBeFocused();
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(page.locator("#flow").getByRole("button", {name:"Motion off",exact:true})).toBeDisabled();
});

test("homepage keeps the left rail and three external reports", async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("/demo", {waitUntil:"networkidle"});
  const rail = page.locator(".rail-sticky");
  await expect(rail).toBeVisible();
  const left = await rail.boundingBox(), main = await page.locator(".overview-content").boundingBox();
  expect(left!.x+left!.width).toBeLessThan(main!.x);
  for (const id of ["web-traffic","github-census","crawler-policies"]) {
    await expect(page.locator("#"+id+" svg").first()).toBeAttached();
  }
  await rail.getByRole("link", {name:"Public GitHub",exact:true}).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#github-census$/);
  await expect(rail.getByRole("link", {name:"Public GitHub",exact:true})).toHaveAttribute("aria-current","location");
  await page.setViewportSize({width:390,height:844});
  await page.goto("/demo");
  await page.locator(".rail summary").click();
  await page.locator(".rail details").getByRole("link",{name:"Web traffic",exact:true}).click();
  await expect(page).toHaveURL(/#web-traffic$/);
  await expect(page.locator("#web-traffic h2")).toBeVisible();
});

test("local visitor dashboards are retired and catalog pages contain no local metrics", async ({ page }) => {
  for (const route of ["/", "/traffic", "/agents", "/agents/gptbot", "/forums", "/demo"]) {
    await page.goto(route);
    await expect(page.locator('a[href^="/visitors"]')).toHaveCount(0);
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/AI visits|last AI visit|Hits \(90d\)|Recent hits|Requests to this site/i);
  }
  await page.goto("/visitors/recent");
  await expect(page).toHaveURL(/\/traffic$/);
  await page.goto("/forums/guestbook");
  await expect(page).toHaveURL(/\/forums$/);
});
