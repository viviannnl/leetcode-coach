/** Sidebar highlight, jumps, landing flash and scroll tracking. */
import { test, expect, open, MIDWAY } from "./fixtures";

const SECTIONS = ["today", "plan", "readiness", "intel", "topics", "activity"];
const current = (page: any) =>
  page.evaluate(() => [...document.querySelectorAll('[data-nav][aria-current="true"]')].map((a: any) => a.dataset.nav));

test.beforeEach(async ({ mockDashboard }) => { await mockDashboard(); });

test("Today is highlighted on load", async ({ page }) => {
  await open(page);
  expect(await current(page)).toEqual(["today"]);
});

for (const id of SECTIONS) {
  test(`clicking ${id} highlights exactly ${id} and lands on its panel`, async ({ page }) => {
    await open(page);
    await page.locator(`[data-nav="${id}"]`).click();
    expect(await current(page)).toEqual([id]);
    await expect(page.locator(`#${id}`)).toHaveClass(/is-target/);
    await expect(page.locator(`#${id}`)).toBeInViewport();
    expect(new URL(page.url()).hash).toBe(`#${id}`);
    await page.waitForTimeout(900); // smooth scroll settles; selection must hold
    expect(await current(page)).toEqual([id]);
  });
}

test("the landing flash clears itself", async ({ page }) => {
  await open(page);
  await page.locator('[data-nav="intel"]').click();
  await expect(page.locator("#intel")).toHaveClass(/is-target/);
  await expect(page.locator("#intel")).not.toHaveClass(/is-target/, { timeout: 2000 });
});

test("scrolling by hand takes over from a click", async ({ page }) => {
  await open(page);
  await page.locator('[data-nav="intel"]').click();
  await page.waitForTimeout(900); // let the jump's smooth scroll finish, as a person would
  await page.locator('[data-nav="readiness"]').click();
  await page.waitForTimeout(900);
  await page.mouse.move(600, 500);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => current(page)).toEqual(["plan"]);
  await page.mouse.wheel(0, -5000);
  await expect.poll(() => current(page)).toEqual(["today"]);
});

test("reaching the bottom highlights a bottom panel", async ({ page }) => {
  await open(page);
  await page.mouse.move(600, 500);
  await page.mouse.wheel(0, 20000);
  await expect.poll(() => current(page)).toEqual(["activity"]);
});

test("highlight survives a re-render", async ({ page }) => {
  await open(page);
  await page.locator('[data-nav="topics"]').click();
  await page.getByRole("button", { name: /Show all \d+$/ }).first().click(); // triggers render()
  expect(await current(page)).toEqual(["topics"]);
});

test("sidebar counts reflect the data", async ({ page }) => {
  await open(page);
  const d = MIDWAY;
  await expect(page.locator('[data-nav="today"] .count')).toHaveText(String(d.today_plan.items.length));
  await expect(page.locator('[data-nav="plan"] .count')).toHaveText(`${d.campaign.weeks.length}w`);
  await expect(page.locator('[data-nav="readiness"] .count')).toHaveText(`${d.readiness.overall}%`);
  await expect(page.locator('[data-nav="intel"] .count')).toHaveText(String(d.company.problems.length));
  await expect(page.locator('[data-nav="activity"] .count')).toHaveText(`${d.due_reviews.length} due`);
});
