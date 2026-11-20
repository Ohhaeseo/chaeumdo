import { defineConfig, devices } from "@playwright/test";

// Browser tests of the whole app (e2e/). They need the backend on 127.0.0.1:8080 with a disposable database;
// the Vite dev server is started here, or reused when it already runs. Each test cleans up the account it creates.
//   npx playwright test                      bundled Chromium (npx playwright install chromium)
//   E2E_CHANNEL=chrome npx playwright test   the installed Google Chrome instead
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"]] : [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Pixel 7"],
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    channel: process.env.E2E_CHANNEL || undefined,
    locale: "ko-KR",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
