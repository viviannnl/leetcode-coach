/**
 * State matrix: every data region in empty / loading / error / populated / edge.
 * All data is mocked from the midway fixture, so each state is reachable on demand.
 */
import { test, expect, open, allowConsoleErrors, expectNoHorizontalOverflow } from "./fixtures";

test.describe("populated @responsive", () => {
  test("renders every panel with fixture content", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    for (const id of ["today", "plan", "activity", "readiness", "intel", "topics"]) {
      await expect(page.locator(`#${id}`), `#${id} panel`).toBeVisible();
    }
    await expect(page.locator("#today .row")).toHaveCount(d.today_plan.items.length);
    await expect(page.locator("#plan .week")).toHaveCount(d.campaign.weeks.length);
    await expect(page.locator("#readiness .ready__num")).toContainText(String(d.readiness.overall));
    await expect(page.locator("#intel .intel-row")).toHaveCount(6);
    await expect(page.locator(".crumbs")).toContainText("Anthropic");
    await expectNoHorizontalOverflow(page);
  });

  test("demo banner explains where content comes from", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    await expect(page.locator("#banner")).toBeVisible();
    await expect(page.locator("#banner")).toContainText("real Claude run");
  });
});

test.describe("provider banners", () => {
  const cases: [string, any, string | null][] = [
    ["claude api, no banner", { demo: null, provider: { name: "anthropic", web_search: true } }, null],
    ["offline fake", { demo: null, provider: { name: "fake", web_search: true } }, "Offline mode"],
    ["bedrock, no web search", { demo: null, provider: { name: "bedrock", web_search: false } }, "Bedrock"],
  ];
  for (const [name, patch, text] of cases) {
    test(name, async ({ page, mockDashboard }) => {
      await mockDashboard((d) => Object.assign(d, patch));
      await open(page);
      if (text) await expect(page.locator("#banner")).toContainText(text);
      else await expect(page.locator("#banner")).toBeHidden();
    });
  }
});

test.describe("loading", () => {
  test("slow load shows a skeleton shaped like the layout, then content", async ({ page, mockDashboard }) => {
    await mockDashboard(undefined, { delayMs: 1500 });
    await page.goto("/");
    await expect(page.locator("#app .skeleton").first()).toBeVisible();
    await expect(page.locator("#app .col")).toHaveCount(2); // skeleton keeps the two-column shape
    await expect(page.locator("#today")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#app .skeleton")).toHaveCount(0);
  });

  test("fast load never flashes the skeleton", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await page.goto("/");
    // Under 300 ms the app stays hidden instead of flashing a skeleton.
    const flashed = await page.evaluate(() => !document.getElementById("app")!.hidden && !!document.querySelector("#app .skeleton"));
    await expect(page.locator("#today")).toBeVisible();
    expect(flashed).toBe(false);
  });
});

test.describe("error", () => {
  test("dashboard failure shows the error and recovers on retry", async ({ page, mockDashboard }, info) => {
    allowConsoleErrors(info); // the 500 is logged by the browser
    await mockDashboard(undefined, { status: 500 });
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("Couldn't load your dashboard");
    await expect(page.getByRole("alert")).toContainText("Server exploded");
    await page.unroute("**/api/dashboard");
    await mockDashboard();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("#today")).toBeVisible();
  });
});

test.describe("empty", () => {
  test("no target -> setup screen", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.target = null; });
    await open(page);
    await expect(page.getByRole("heading", { name: "Who are you preparing for?" })).toBeVisible();
    await expect(page.locator("[data-nav]")).toHaveCount(0);
    await expect(page.locator(".crumbs")).toHaveText("Setup");
  });

  test("no plan today -> time picker", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { delete d.today_plan; });
    await open(page);
    await expect(page.locator("#today")).toContainText("How much time do you have?");
    await expect(page.getByRole("button", { name: "Plan my session" })).toBeEnabled();
    await expect(page.locator("#recap")).toHaveCount(0);
  });

  test("plan with zero items", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.today_plan.items = []; d.today_plan.total_minutes = 0; });
    await open(page);
    await expect(page.locator("#today")).toContainText("Nothing to practise right now");
  });

  test("no campaign -> build plan prompt", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { delete d.campaign; });
    await open(page);
    await expect(page.locator("#plan")).toContainText("No plan yet");
    await expect(page.getByRole("button", { name: "Build my plan" })).toBeVisible();
  });

  test("no interview date -> ask for one", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.target.interview_date = null; d.target.days_left = null; delete d.campaign; });
    await open(page);
    await expect(page.locator("#plan")).toContainText("Add an interview date");
    await expect(page.locator(".side-count")).toHaveCount(0);
  });

  test("no intel yet -> gather prompt, intel panel absent", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { delete d.company; delete d.readiness; });
    await open(page);
    await expect(page.locator("#readiness")).toContainText("Learn what Anthropic asks");
    await expect(page.locator("#intel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh intel" })).toHaveCount(0);
  });

  test("no activity and nothing due", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.activity = []; d.due_reviews = []; });
    await open(page);
    await expect(page.locator("#activity")).toContainText("Nothing logged yet");
    await expect(page.locator('[data-nav="activity"] .count')).toHaveCount(0);
  });

  test("stale campaign after a date change", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.campaign.stale = true; });
    await open(page);
    await expect(page.locator("#plan")).toContainText("interview date changed");
  });
});

test.describe("edge cases @responsive", () => {
  const LONG = "Implement a distributed, crash-durable, multi-tenant in-memory key-value database with TTL, snapshots and history lookups across shards";

  test("very long titles truncate instead of overflowing", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => {
      d.today_plan.items[0].title = LONG;
      d.company.problems[0].title = LONG;
      d.campaign.weeks[2].theme = LONG;
      d.activity[0].title = LONG;
    });
    await open(page);
    await expectNoHorizontalOverflow(page);
    const t = page.locator("#today .row").first().locator(".row__title > span").first();
    await expect(t).toHaveAttribute("title", LONG); // full text still available
    const clipped = await t.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped, "long title should be truncated with an ellipsis").toBe(true);
  });

  test("big numbers and extremes", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => {
      d.target.days_left = 365; d.streak = 1000; d.readiness.overall = 100;
      d.readiness.problem_coverage = 100; d.readiness.topic_strength = 100;
      d.due_reviews = Array.from({ length: 40 }, (_, i) => ({ ...d.due_reviews[0], title: `Problem ${i}` }));
    });
    await open(page);
    await expect(page.locator("#readiness .ready__num")).toContainText("100");
    await expect(page.locator(".stats")).toContainText("1000");
    await expectNoHorizontalOverflow(page);
  });

  test("hostile text is shown as text, never executed", async ({ page, mockDashboard }) => {
    const evil = `<img src=x onerror="window.__xss=1">"><script>window.__xss=2</script>`;
    await mockDashboard((d) => {
      d.today_plan.coach_note = evil;
      d.today_plan.items[0].title = evil;
      d.company.problems[0].description = evil;
      d.company.sources.push({ kind: "web", title: evil, url: "javascript:window.__xss=3" });
      d.today_plan.items[0].link = "javascript:window.__xss=4";
    });
    await open(page);
    await expect(page.locator("#today .note")).toContainText("<img src=x");
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(await page.locator("img").count()).toBe(0);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
  });

  test("missing optional fields don't break rendering", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => {
      d.today_plan.coach_note = "";
      d.today_plan.items.forEach((i: any) => { i.reason = ""; i.link = ""; });
      d.company.advice = [];
      d.company.interview_format = "";
      d.campaign.summary = "";
      d.campaign.weeks[0].problems = [];
    });
    await open(page);
    await expect(page.locator("#today .note")).toHaveCount(0);
    await expect(page.locator("#today .ext")).toHaveCount(0);
    await expect(page.locator("#intel").getByText("What candidates say")).toHaveCount(0);
  });
});
