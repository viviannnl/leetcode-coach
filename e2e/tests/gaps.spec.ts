/**
 * Paths the coverage report found untested: failure/success toasts of every
 * job, re-plan on a date-only change, validation, keyboard scroll release,
 * toast auto-hide and the less common render branches.
 */
import { test, expect, open, allowConsoleErrors } from "./fixtures";

test("research failure shows an error toast", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard();
  await mockJob("/api/research", { error: "No data found for Anthropic." });
  await open(page);
  await page.getByRole("button", { name: "Refresh intel" }).click();
  await expect(page.locator("#toast")).toContainText("No data found");
  await expect(page.locator("#toast")).toHaveClass(/toast--error/);
});

test("re-plan from today: success toast, then failure toast", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard();
  await mockJob("/api/campaign");
  await open(page);
  await page.getByRole("button", { name: "Re-plan from today" }).click();
  await expect(page.locator("#toast")).toHaveText("Your plan to the interview is ready.");
  await page.unroute("**/api/campaign");
  await mockJob("/api/campaign", { error: "The interview date must be in the future." });
  await page.getByRole("button", { name: "Re-plan from today" }).click();
  await expect(page.locator("#toast")).toContainText("must be in the future");
});

test("toasts hide themselves", async ({ page, mockDashboard }) => {
  await mockDashboard();
  await open(page);
  await page.getByRole("button", { name: "Record session" }).click(); // empty recap -> error toast
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toBeHidden({ timeout: 9000 });
});

test("changing only the date re-plans without re-researching", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard();
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") posts.push(new URL(r.url()).pathname); });
  await page.route("**/api/target", (r) => r.fulfill({ json: { ok: true } }));
  await mockJob("/api/campaign");
  await open(page);
  await page.getByRole("button", { name: "Change target" }).click();
  await page.locator("#interview_date").fill("2026-12-20");
  await page.getByRole("button", { name: "Save target" }).click();
  await expect.poll(() => posts).toEqual(["/api/target", "/api/campaign"]);
});

test("out-of-range minutes are rejected without a request", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard((d) => { delete d.today_plan; });
  const job = await mockJob("/api/plan");
  await open(page);
  await page.locator("#today .custom-min").fill("700");
  await page.getByRole("button", { name: "Plan my session" }).click();
  await expect(page.locator("#toast")).toContainText("between 5 and 600");
  expect(job.bodies).toHaveLength(0);
});

test("an API error without a message still explains itself", async ({ page }, info) => {
  allowConsoleErrors(info);
  await page.route("**/api/dashboard", (r) => r.fulfill({ status: 502, body: "Bad gateway" }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Request failed (502)");
});

test("PageDown after a sidebar jump hands control back to scrolling", async ({ page, mockDashboard }) => {
  await mockDashboard();
  await open(page);
  await page.locator('[data-nav="readiness"]').click();
  await page.waitForTimeout(900);
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-nav][aria-current]')?.getAttribute("data-nav"))).not.toBe("readiness");
});

test("toggling the theme back to dark", async ({ page, mockDashboard }) => {
  await mockDashboard();
  await open(page);
  await page.locator("#theme-toggle").click();
  await page.locator("#theme-toggle").click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  expect(await page.evaluate(() => localStorage.getItem("lc-theme"))).toBe("dark");
});

test("less common render branches", async ({ page, mockDashboard }) => {
  await mockDashboard((d) => {
    d.today_plan.items[1].status = "solved";        // done item in today's plan
    d.today_plan.items[1].kind = "new";
    d.today_plan.items[0].source = "company";       // company pick label
    d.company.problems[0].description = "";         // falls back to evidence
    d.activity[0].outcome = "some_new_outcome";     // unknown outcome still renders
  });
  await open(page);
  await expect(page.locator("#today .row--done")).toHaveCount(1);
  await expect(page.locator("#today .row").first()).toContainText("Anthropic pick");
  await expect(page.locator("#intel .intel-row").first().locator(".intel-row__desc")).not.toBeEmpty();
  await expect(page.locator("#activity .activity--recent li").first()).toContainText("some_new_outcome");
});

test("intel with no problems", async ({ page, mockDashboard }) => {
  await mockDashboard((d) => { d.company.problems = []; });
  await open(page);
  await expect(page.locator("#intel")).toContainText("No specific problems found yet.");
});

test("recap failure keeps the text and explains", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard();
  await mockJob("/api/feedback", { error: "Model request failed (500): Internal error" });
  await open(page);
  await page.locator("#recap").fill("Profiler took 30 min, clean.");
  await page.getByRole("button", { name: "Record session" }).click();
  await expect(page.locator("#toast")).toContainText("Internal error");
  await expect(page.locator("#recap")).toHaveValue("Profiler took 30 min, clean.");
});

test("abandon failure keeps the session", async ({ page, mockDashboard }, info) => {
  allowConsoleErrors(info);
  await mockDashboard((d) => { d.design_session = { id: "abc123", title: "Design a Rate Limiter", status: "active", transcript: [{ role: "interviewer", text: "Hi", phase: "requirements" }], concepts: [], hints: 0 }; });
  await page.route("**/api/design/abandon", (r) => r.fulfill({ status: 400, json: { error: "That design session doesn't exist." } }));
  await open(page);
  await page.getByRole("button", { name: "Abandon" }).click();
  await page.getByRole("button", { name: "Abandon, record nothing" }).click();
  await expect(page.locator("#toast")).toContainText("doesn't exist");
});

test("unlink failure explains", async ({ page, mockDashboard }, info) => {
  allowConsoleErrors(info);
  await mockDashboard((d) => { d.leetcode = { username: "vivian_codes", synced_at: new Date().toISOString(), solved: { All: 1, Easy: 1, Medium: 0, Hard: 0 }, tags: [], last_added: [], last_other: [] }; });
  await page.route("**/api/leetcode/unlink", (r) => r.fulfill({ status: 500, json: { error: "Couldn't save state." } }));
  await open(page);
  await page.locator("#activity").getByRole("button", { name: "Unlink" }).click();
  await expect(page.locator("#toast")).toContainText("Couldn't save state");
});
