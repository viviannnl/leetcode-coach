/**
 * Visual regression: pixel baselines per theme and viewport. Any unintended
 * visual change (a colour, a border, spacing) fails with a diff image.
 * Update intentionally with:  npm run test:update
 */
import fs from "node:fs";
import { test, expect, open } from "./fixtures";
import type { Page } from "@playwright/test";

/** Settle the page for a shot: no hover, and a non-sticky toolbar so it can't overlap an element shot.
 *  (Done through the CSSOM: the app's CSP rightly blocks injected <style> tags.) */
async function prep(page: Page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => { (document.querySelector(".toolbar") as HTMLElement).style.position = "static"; });
}

test.describe("visual @responsive", () => {
  test.beforeEach(async ({ mockDashboard }) => { await mockDashboard(); });

  for (const theme of ["dark", "light"]) {
    test(`dashboard — ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("lc-theme", t), theme);
      await open(page);
      await prep(page);
      await expect(page).toHaveScreenshot(`dashboard-${theme}.png`, { fullPage: true });
    });
  }

  test("today panel", async ({ page }) => {
    await open(page);
    await prep(page);
    await expect(page.locator("#today")).toHaveScreenshot("today.png");
  });

  test("plan panel, week expanded", async ({ page }) => {
    await open(page);
    await page.locator('[data-week="2"]').click();
    await prep(page);
    await expect(page.locator("#plan")).toHaveScreenshot("plan.png");
  });

  test("intel panel", async ({ page }) => {
    await open(page);
    await prep(page);
    await expect(page.locator("#intel")).toHaveScreenshot("intel.png");
  });

  test("setup screen", async ({ page, mockDashboard }) => {
    await page.unroute("**/api/dashboard");
    await mockDashboard((d) => { d.target = null; });
    await open(page);
    await prep(page);
    await expect(page).toHaveScreenshot("setup.png");
  });
});

test.describe("visual: design @responsive", () => {
  const session = JSON.parse(fs.readFileSync(new URL("../fixtures/design-session.json", import.meta.url), "utf8"));
  test("session panel", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { const { scorecard, finished, ...s } = session; d.design_session = { ...s, status: "active" }; });
    await open(page);
    await prep(page);
    await expect(page.locator("#session")).toHaveScreenshot("session.png");
  });
  test("scorecard panel", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.design_scorecards = [{ id: session.id, title: session.title, finished: session.finished, minutes: session.minutes, scorecard: session.scorecard }]; });
    await open(page);
    await page.getByRole("list", { name: "Mock interviews" }).getByRole("button", { name: "Scorecard" }).click();
    await page.waitForTimeout(900); // the jump's smooth scroll settles before the shot
    await prep(page);
    await expect(page.locator("#session")).toHaveScreenshot("scorecard.png");
  });
  test("readiness panel", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    await prep(page);
    await expect(page.locator("#readiness")).toHaveScreenshot("readiness.png");
  });
});
