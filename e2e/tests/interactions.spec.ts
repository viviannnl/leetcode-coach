/**
 * Every control: what it does, plus its busy / disabled / error states.
 * Background jobs are mocked so busy and error states can be held and inspected.
 */
import { test, expect, open, allowConsoleErrors } from "./fixtures";

test.describe("today", () => {
  test("minute picker: presets and custom value stay in sync", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { delete d.today_plan; });
    const job = await mockJob("/api/plan");
    await open(page);
    const preset = (m: number) => page.locator(`#today [data-minutes="${m}"]`);
    await preset(45).click();
    await expect(preset(45)).toHaveAttribute("aria-pressed", "true");
    await expect(preset(60)).toHaveAttribute("aria-pressed", "false");
    await page.locator("#today .custom-min").fill("50");
    for (const m of [30, 45, 60, 90, 120]) await expect(preset(m)).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Plan my session" }).click();
    await expect.poll(() => job.bodies.length).toBe(1);
    expect(job.bodies[0]).toEqual({ minutes: 50 });
  });

  test("planning shows progress, locks every job button, then re-renders", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { delete d.today_plan; });
    await mockJob("/api/plan", { steps: ["Planning your best 60 minutes…", "Still thinking…"], holdMs: 400 });
    await open(page);
    await page.getByRole("button", { name: "Plan my session" }).click();
    const busy = page.locator('#today button[aria-busy="true"]');
    await expect(busy).toBeDisabled();
    await expect(busy.locator(".spinner")).toBeVisible();
    await expect(page.locator("#job-plan")).toContainText(/Planning|Still thinking/);
    // Other model-backed buttons are locked while a job runs.
    await expect(page.getByRole("button", { name: "Re-plan from today" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Refresh intel" })).toBeDisabled();
    await expect(page.locator('#today button[aria-busy="true"]')).toHaveCount(0, { timeout: 5000 });
  });

  test("job failure surfaces as an error toast and unlocks buttons", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    await mockJob("/api/plan", { error: "Rate limited by the API — try again in a minute." });
    await open(page);
    await page.locator("details.replan summary").click();
    await page.getByRole("button", { name: "Re-plan today" }).click();
    await expect(page.locator("#toast")).toHaveClass(/toast--error/);
    await expect(page.locator("#toast")).toContainText("Rate limited");
    await expect(page.getByRole("button", { name: "Re-plan from today" })).toBeEnabled();
  });

  test("empty recap is rejected without a request", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    const job = await mockJob("/api/feedback");
    await open(page);
    await page.getByRole("button", { name: "Record session" }).click();
    await expect(page.locator("#toast")).toContainText("Write a line or two");
    await expect(page.locator("#recap")).toBeFocused();
    expect(job.bodies).toHaveLength(0);
  });

  test("recap via ⌘↵ shows what was recorded", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    const job = await mockJob("/api/feedback", {
      steps: ["Reading your recap…"],
      result: {
        applied: [
          { title: "Clone Graph", outcome: "solved_independently", next_review: "2026-11-28" },
          { title: "Rotting Oranges", outcome: "solved_with_hints", next_review: "2026-11-27" },
        ],
        unmatched: ["that bank thing"],
        coach_note: "Clone Graph stuck this time.",
      },
    });
    await open(page);
    await page.locator("#recap").fill("Clone Graph 15 min, clean. Rotting Oranges needed a hint.");
    await page.locator("#recap").press("Meta+Enter");
    await expect(page.locator(".result li")).toHaveCount(2);
    await expect(page.locator(".result")).toContainText("Clone Graph stuck this time.");
    await expect(page.locator(".result")).toContainText("With hints");
    await expect(page.locator(".result")).toContainText("Couldn't match: that bank thing");
    await expect(page.locator("#recap")).toHaveValue(""); // cleared after success
    expect(job.bodies[0]).toEqual({ text: "Clone Graph 15 min, clean. Rotting Oranges needed a hint." });
  });

  test("typing in the recap survives progress updates", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    await mockJob("/api/campaign", { steps: ["one", "two", "three"], holdMs: 200 });
    await open(page);
    await page.getByRole("button", { name: "Re-plan from today" }).click();
    await page.locator("#recap").pressSequentially("still typing", { delay: 30 });
    await expect(page.locator("#recap")).toHaveValue("still typing");
  });

  test("problem links open LeetCode safely in a new tab", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    const links = page.locator('a[target="_blank"]');
    expect(await links.count()).toBeGreaterThan(10);
    for (const a of await links.all()) {
      await expect(a).toHaveAttribute("rel", /noopener/);
      expect(await a.getAttribute("href")).toMatch(/^https?:\/\//);
    }
  });
});

test.describe("plan", () => {
  test("current week opens by default; weeks toggle with aria state", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    const current = d.campaign.weeks.find((w: any) => w.current);
    for (const w of d.campaign.weeks) {
      const head = page.locator(`[data-week="${w.index}"]`);
      await expect(head).toHaveAttribute("aria-expanded", String(w === current));
      await expect(head).toHaveAttribute("aria-controls", `week-${w.index}`);
    }
    await page.locator('[data-week="1"]').click();
    await expect(page.locator("#week-1")).toBeVisible();
    await expect(page.locator('[data-week="1"]')).toHaveAttribute("aria-expanded", "true");
    await page.locator(`[data-week="${current.index}"]`).click();
    await expect(page.locator(`#week-${current.index}`)).toBeHidden();
  });

  test("progress segments match each week's problems and statuses", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    for (const w of d.campaign.weeks) {
      const segs = page.locator(`[data-week="${w.index}"] .segs i`);
      await expect(segs).toHaveCount(w.problems.length);
      const solvedNotDue = w.problems.filter((p: any) => p.status === "solved" && !p.due).length;
      await expect(page.locator(`[data-week="${w.index}"] .segs i.s-solved`)).toHaveCount(solvedNotDue);
      await expect(page.locator(`[data-week="${w.index}"] .week__count`)).toHaveText(`${w.done}/${w.problems.length}`);
    }
  });

  test("status icons are labelled for screen readers", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    const labels = await page.locator("#plan .week__list .st").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(["Not started", "In progress", "Solved", "Review due"]).toContain(l);
  });
});

test.describe("intel", () => {
  test("show all / fewer problems", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    await page.getByRole("button", { name: `Show all ${d.company.problems.length}` }).click();
    await expect(page.locator("#intel .intel-row")).toHaveCount(d.company.problems.length);
    await page.locator("#intel").getByRole("button", { name: "Show fewer" }).click();
    await expect(page.locator("#intel .intel-row")).toHaveCount(6);
  });

  test("interview format clamps and expands", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    const text = page.locator(".format__text");
    const clampedH = await text.evaluate((e) => e.getBoundingClientRect().height);
    await page.getByRole("button", { name: "Read more" }).click();
    await expect(text).toHaveClass(/is-open/);
    expect(await text.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(clampedH);
    await page.getByRole("button", { name: "Less" }).click();
    await expect(text).not.toHaveClass(/is-open/);
  });

  test("advice and sources disclose", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    await page.getByText(`What candidates say · ${d.company.advice.length}`).click();
    await expect(page.locator(".advice li")).toHaveCount(d.company.advice.length);
    await page.locator("#intel summary", { hasText: "Sources" }).click();
    await expect(page.locator(".sources li")).toHaveCount(d.company.sources.length);
  });

  test("practical problems don't repeat the topic tag", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    const practical = page.locator("#intel .intel-row", { has: page.locator(".tag", { hasText: /^Practical$/ }) });
    expect(await practical.count()).toBeGreaterThan(0);
    for (const row of await practical.all()) await expect(row.locator(".tag", { hasText: "Practical Coding" })).toHaveCount(0);
  });

  test("refresh intel runs a research job", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    const job = await mockJob("/api/research", { steps: ["Searching the web…"], result: { problems: 26, web_status: "ok — 98 sources" } });
    await open(page);
    await page.getByRole("button", { name: "Refresh intel" }).click();
    await expect(page.locator("#toast")).toContainText("Found 26 problems");
    expect(job.bodies).toHaveLength(1);
  });
});

test.describe("topics", () => {
  test("shows what matters first, all on demand", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    const rows = page.locator("#topics .topics li");
    expect(await rows.count()).toBeLessThanOrEqual(8);
    await expect(rows.first()).toContainText(d.company.topic_weights[0].topic);
    await page.getByRole("button", { name: `Show all ${d.topics.length}` }).click();
    await expect(rows).toHaveCount(d.topics.length);
  });
});

test.describe("setup", () => {
  test("validation, then target -> research -> campaign in order", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { d.target = null; });
    const order: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST") order.push(new URL(r.url()).pathname); });
    await page.route("**/api/target", (r) => r.fulfill({ json: { ok: true } }));
    await mockJob("/api/research", { result: { problems: 26, web_status: "ok" } });
    await mockJob("/api/campaign");
    await open(page);
    await page.getByRole("button", { name: "Start preparing" }).click();
    await expect(page.locator(".form-error")).toHaveText("Which company are you preparing for?");
    await expect(page.locator("#company")).toBeFocused();
    await page.locator("#company").fill("Anthropic");
    await page.locator("#interview_date").fill("2026-12-25");
    // After saving, the server reports the new target (served by the next dashboard fetch).
    await page.unroute("**/api/dashboard");
    await mockDashboard((d) => { delete d.company; delete d.campaign; });
    await page.getByRole("button", { name: "Start preparing" }).click();
    await expect.poll(() => order).toEqual(["/api/target", "/api/research", "/api/campaign"]);
  });

  test("server-side validation error is shown inline", async ({ page, mockDashboard }, info) => {
    allowConsoleErrors(info);
    await mockDashboard((d) => { d.target = null; });
    await page.route("**/api/target", (r) => r.fulfill({ status: 400, json: { error: "Interview date must look like 2026-12-25." } }));
    await open(page);
    await page.locator("#company").fill("Anthropic");
    await page.getByRole("button", { name: "Start preparing" }).click();
    await expect(page.locator(".form-error")).toContainText("Interview date must look like");
  });

  test("edit target opens prefilled; Escape and Cancel close it", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    await page.getByRole("button", { name: "Change target" }).click();
    await expect(page.locator("#company")).toHaveValue("Anthropic");
    await expect(page.locator("#company")).toBeFocused();
    await expect(page.locator("#interview_date")).toHaveValue("2026-12-25");
    await page.keyboard.press("Escape");
    await expect(page.locator("#today")).toBeVisible();
    await page.getByRole("button", { name: "Change target" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("#today")).toBeVisible();
  });
});
