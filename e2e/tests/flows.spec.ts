/**
 * End-to-end against the real backend (demo mode: offline coach, pinned date,
 * no credits). These change server state, so they run serially, desktop only,
 * and assert relative outcomes.
 */
import { test, expect, open } from "./fixtures";

test.describe.configure({ mode: "serial" });

test("the real API serves a dashboard the UI renders", async ({ page }) => {
  await open(page);
  await expect(page.locator("#today .row").first()).toBeVisible();
  await expect(page.locator("#intel .intel-row").first()).toBeVisible();
});

test("re-plan today with 30 minutes", async ({ page }) => {
  await open(page);
  await page.locator("details.replan summary").click();
  await page.locator('details.replan [data-minutes="30"]').click();
  await page.getByRole("button", { name: "Re-plan today" }).click();
  await expect(page.locator("#today .panel__head .meta")).toContainText("/30m", { timeout: 10_000 });
});

test("record a session and see it in activity", async ({ page }) => {
  await open(page);
  const first = (await page.locator("#today .row__title > span").first().textContent())!.trim();
  await page.locator("#recap").fill(`${first} took 12 min, solved it.`);
  await page.locator("#recap").press("Meta+Enter");
  await expect(page.locator(".result li").first()).toContainText(first, { timeout: 10_000 });
  await expect(page.locator("#activity .activity--recent li").first()).toContainText(first);
});

test("API guards reject cross-site style requests", async ({ request }) => {
  const form = await request.post("/api/plan", { form: { minutes: "30" } });
  expect(form.status()).toBe(415);
  const host = await request.get("/api/dashboard", { headers: { Host: "evil.example" } });
  expect(host.status()).toBe(403);
});
