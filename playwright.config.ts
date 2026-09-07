import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: ".qa/test-results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: ".qa/playwright-report", open: "never" }]],
  use: {
    extraHTTPHeaders: { Purpose: "prefetch" },
    baseURL: process.env.QA_SITE_URL ?? "http://127.0.0.1:3100",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
