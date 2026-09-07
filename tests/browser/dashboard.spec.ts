import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("dashboard demo identifies synthetic data and supports evidence inspection", async ({ page }) => {
  await page.goto("/demo", { waitUntil: "networkidle" });
  await expect(page.getByText("These numbers and records are synthetic.", {exact:true})).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".flow")).toHaveAttribute("data-mode", "demo");
  await expect(page.locator(".flow-link")).toHaveCount(11);
  await page.getByRole("button", {name:"This website",exact:true}).click();
  await expect(page.locator(".flow-link")).toHaveCount(3);
  await page.getByLabel("Inspect source", {exact:true}).selectOption("web:fetchers");
  const evidence = page.getByRole("region", {name:"Source evidence and coverage"});
  await expect(evidence).toContainText("2,100 matched / 2,800 checkable requests");
  await expect(evidence).toContainText("77.8% checkable");
  await expect(evidence).toContainText("29 signature headers, unverified");
  await page.getByRole("button", {name:"Maps",exact:true}).click();
  await expect(evidence).toContainText("12/30 UTC dates contain rows");
  await expect(evidence).toContainText("partial");
  await page.getByRole("button", {name:"Forums",exact:true}).click();
  await expect(evidence).toContainText("Stale · failed");
  await page.getByRole("button", {name:"All destinations",exact:true}).click();
  await expect(page.locator(".flow-link")).toHaveCount(11);
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({colorScheme:"light",reducedMotion:"reduce"});
  await page.getByLabel("Inspect source", {exact:true}).selectOption("web:training");
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
