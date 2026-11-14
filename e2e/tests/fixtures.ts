/**
 * Shared test fixtures.
 *
 * Every test gets:
 *  - a strict console: any page error or console.error fails the test, unless
 *    the test opts out with `allowConsoleErrors(testInfo)` (for deliberate 4xx/5xx).
 *  - JS coverage of /static/app.js, written to .coverage/ for coverage-report.mjs.
 *  - `mockDashboard(mutate)`: serve fixtures/midway.json (optionally modified)
 *    for GET /api/dashboard.
 *  - `mockJob(path, result)`: fake a background job (POST path -> poll -> done/error).
 */
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIDWAY = JSON.parse(fs.readFileSync(path.join(here, "../fixtures/midway.json"), "utf8"));
const COVERAGE_DIR = path.join(here, "../.coverage");

export type Dashboard = typeof MIDWAY & Record<string, any>;
type Mutate = (d: Dashboard) => Dashboard | void;

// Chrome drops a page's coverage when it navigates away, so coverage gathered
// before a reload would be lost (and reported as "never run"). reload() saves it first.
const earlier = new WeakMap<Page, any[]>();

/** Reload without losing the coverage collected so far. Use instead of page.reload(). */
export async function reload(page: Page) {
  earlier.get(page)?.push(...(await page.coverage.stopJSCoverage()));
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.reload();
}

export function allowConsoleErrors(info: TestInfo) {
  info.annotations.push({ type: "allow-console-errors" });
}

type JobOpts = { steps?: string[]; error?: string; result?: unknown; holdMs?: number };

export const test = base.extend<{
  mockDashboard: (mutate?: Mutate, opts?: { delayMs?: number; status?: number }) => Promise<Dashboard>;
  mockJob: (endpoint: string, opts?: JobOpts) => Promise<{ bodies: unknown[] }>;
}>({
  page: async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    earlier.set(page, []);
    await use(page);
    const cov = [...(earlier.get(page) ?? []), ...(await page.coverage.stopJSCoverage())].filter((e) => e.url.endsWith("/static/app.js"));
    if (cov.length) {
      fs.mkdirSync(COVERAGE_DIR, { recursive: true });
      const id = `${testInfo.project.name}-${testInfo.testId}`.replace(/[^a-z0-9-]/gi, "_");
      fs.writeFileSync(path.join(COVERAGE_DIR, `${id}.json`), JSON.stringify(cov));
    }
    if (!testInfo.annotations.some((a) => a.type === "allow-console-errors")) {
      expect(errors, "unexpected console errors").toEqual([]);
    }
  },

  mockDashboard: async ({ page }, use) => {
    await use(async (mutate, opts = {}) => {
      const data: Dashboard = structuredClone(MIDWAY);
      const out = (mutate && mutate(data)) || data;
      await page.route("**/api/dashboard", async (route) => {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        await route.fulfill({ status: opts.status ?? 200, json: opts.status && opts.status >= 400 ? { error: "Server exploded" } : out });
      });
      return out;
    });
  },

  mockJob: async ({ page }, use) => {
    let n = 0;
    await use(async (endpoint, opts = {}) => {
      const bodies: unknown[] = [];
      const id = `job${++n}`;
      const steps = opts.steps ?? [];
      let polls = 0;
      await page.route(`**${endpoint}`, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        bodies.push(route.request().postDataJSON());
        polls = 0;
        await route.fulfill({ json: { job: id } });
      });
      await page.route(`**/api/jobs/${id}`, async (route) => {
        if (opts.holdMs) await new Promise((r) => setTimeout(r, opts.holdMs));
        const i = polls++;
        if (i < steps.length) return route.fulfill({ json: { id, status: "running", message: steps[i] } });
        if (opts.error) return route.fulfill({ json: { id, status: "error", error: opts.error } });
        return route.fulfill({ json: { id, status: "done", result: opts.result ?? true } });
      });
      return { bodies };
    });
  },
});

export { expect };

/** Load the dashboard and wait until the real content (not the skeleton) is in. */
export async function open(page: Page, hash = "") {
  await page.goto(`/${hash}`);
  await page.locator("#today, #target-form, .work [role=alert]").first().waitFor();
  // Wait out the first-paint entrance animation (panels fade in), so contrast
  // checks and screenshots see the settled UI.
  await page.waitForFunction(() => !document.body.classList.contains("first-paint"));
}

/** No element may make the page scroll sideways. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, "page scrolls horizontally").toBeLessThanOrEqual(iw);
}
