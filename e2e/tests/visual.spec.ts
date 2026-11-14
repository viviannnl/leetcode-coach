/**
 * Visual regression: pixel baselines per theme and viewport. Any unintended
 * visual change (a colour, a border, spacing) fails with a diff image.
 * Update intentionally with:  npm run test:update
 */
import { test, expect, open } from "./fixtures";

test.describe("visual @responsive", () => {
  test.beforeEach(async ({ mockDashboard }) => { await mockDashboard(); });

  for (const theme of ["dark", "light"]) {
    test(`dashboard — ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("lc-theme", t), theme);
      await open(page);
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`dashboard-${theme}.png`, { fullPage: true });
    });
  }

  test("today panel", async ({ page }) => {
    await open(page);
    await page.mouse.move(0, 0);
    await expect(page.locator("#today")).toHaveScreenshot("today.png");
  });

  test("plan panel, week expanded", async ({ page }) => {
    await open(page);
    await page.locator('[data-week="2"]').click();
    await page.mouse.move(0, 0);
    await expect(page.locator("#plan")).toHaveScreenshot("plan.png");
  });

  test("intel panel", async ({ page }) => {
    await open(page);
    await page.mouse.move(0, 0);
    await expect(page.locator("#intel")).toHaveScreenshot("intel.png");
  });

  test("setup screen", async ({ page, mockDashboard }) => {
    await page.unroute("**/api/dashboard");
    await mockDashboard((d) => { d.target = null; });
    await open(page);
    await expect(page).toHaveScreenshot("setup.png");
  });
});
