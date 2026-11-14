import { defineConfig } from "@playwright/test";

const PORT = 8790;

/**
 * UI test suite for the dashboard.
 *
 * - Server: the real Flask app in demo mode (recorded content, pinned date,
 *   offline coach), started fresh for each run, so no API credits are spent.
 * - Most specs mock /api/* from fixtures/midway.json, so every state (empty,
 *   loading, error, edge) is reachable and pixel-stable. flows.spec.ts is the
 *   only one that talks to the real backend.
 * - Uses the installed Google Chrome (channel "chrome"); no browser download.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      // Small screens: layout, visual and a11y specs only (tagged @responsive).
      name: "mobile",
      grep: /@responsive/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: `cd .. && python -m coach dashboard --demo --no-browser --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/dashboard`,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 20_000,
  },
});
