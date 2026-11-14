/**
 * Level-aware intel, the interview loop, readiness by round, the weekly time
 * split, and system design mock interviews (start → answer → finish → scorecard).
 * Session data is the real recorded transcript in fixtures/design-session.json.
 */
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, open, expectNoHorizontalOverflow, reload } from "./fixtures";

const here = path.dirname(fileURLToPath(import.meta.url));
const RECORDED = JSON.parse(fs.readFileSync(path.join(here, "../fixtures/design-session.json"), "utf8"));
/** The recorded session as it looked mid-interview (before grading). */
const active = (upTo = RECORDED.transcript.length) => {
  const { scorecard, finished, ...rest } = structuredClone(RECORDED);
  return { ...rest, status: "active", transcript: rest.transcript.slice(0, upTo) };
};
const scorecardEntry = () => ({ id: RECORDED.id, title: RECORDED.title, finished: RECORDED.finished, minutes: RECORDED.minutes, scorecard: RECORDED.scorecard });
const scan = async (page: any) => {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.map((v: any) => `${v.id}: ${v.nodes.length}× ${v.nodes[0].target}`)).toEqual([]);
};

test.describe("interview loop and readiness @responsive", () => {
  test("loop lists every round with its track; untracked rounds say so", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    const items = page.locator("#intel .loop li");
    await expect(items).toHaveCount(d.company.rounds.length);
    for (const [i, r] of d.company.rounds.entries()) {
      await expect(items.nth(i)).toContainText(r.name);
      if (!["algorithms", "practical", "system_design"].includes(r.track)) await expect(items.nth(i)).toContainText("no track");
    }
    await expect(page.locator("#intel .note .label").first()).toContainText(d.target.level_label);
  });

  test("readiness shows tracked rounds with scores and collapses untracked ones", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    const tracked = d.readiness.rounds.filter((r: any) => r.score != null);
    const untracked = d.readiness.rounds.filter((r: any) => r.score == null);
    await expect(page.locator("#readiness .round:not(.round--untracked)")).toHaveCount(tracked.length);
    for (const r of tracked) await expect(page.locator("#readiness .rounds")).toContainText(`${r.score}%`);
    const line = page.locator("#readiness .round--untracked");
    await expect(line).toContainText(`${Math.round(d.readiness.untracked_weight * 100)}% of loop`);
    for (const r of untracked) await expect(line).toContainText(r.name);
  });

  test("every round untracked still renders sensibly", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => {
      d.readiness.rounds = d.readiness.rounds.map((r: any) => ({ ...r, score: null }));
      d.readiness.untracked_weight = 1;
      d.readiness.overall = 0;
    });
    await open(page);
    await expect(page.locator("#readiness .round:not(.round--untracked)")).toHaveCount(0);
    await expect(page.locator("#readiness .round--untracked")).toContainText("100% of loop");
  });

  test("intel from an old profile without rounds hides the loop", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.company.rounds = []; });
    await open(page);
    await expect(page.locator("#intel .loop")).toHaveCount(0);
    await expect(page.locator("#intel")).toBeVisible();
  });

  test("intel gathered for another level asks for a refresh", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { d.company.stale_level = true; d.target.level = "senior"; d.target.level_label = "Senior"; });
    const job = await mockJob("/api/research", { result: { problems: 30, web_status: "ok" } });
    await open(page);
    await expect(page.locator("#intel .note--warn")).toContainText("different level");
    await page.getByRole("button", { name: "Refresh for Senior" }).click();
    await expect.poll(() => job.bodies.length).toBe(1);
  });

  test("week shows its time split by track", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    const cur = d.campaign.weeks.find((w: any) => w.current);
    const strip = page.locator(`#week-${cur.index} .alloc`);
    await expect(strip.locator(".alloc__bar i")).toHaveCount(cur.allocation.length);
    for (const a of cur.allocation) await expect(strip).toContainText({ practical: "Practical coding", system_design: "System design", algorithms: "Algorithms" }[a.track as string]!);
    const label = await strip.getAttribute("aria-label");
    expect(label).toMatch(/^Time split: /);
    // Segment widths follow the minutes.
    const grows = await strip.locator(".alloc__bar i").evaluateAll((els) => els.map((e) => Number((e as HTMLElement).style.getPropertyValue("--grow"))));
    const total = cur.allocation.reduce((n: number, a: any) => n + a.minutes, 0);
    cur.allocation.forEach((a: any, i: number) => expect(grows[i]).toBeCloseTo(a.minutes / total, 2));
  });

  test("old campaigns without a split render without the strip", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.campaign.weeks.forEach((w: any) => { w.allocation = []; }); });
    await open(page);
    await expect(page.locator("#plan .alloc")).toHaveCount(0);
  });

  test("design and practical items are labelled in the week list", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    const cur = d.campaign.weeks.find((w: any) => w.current);
    const designs = cur.problems.filter((p: any) => p.track === "system_design").length;
    await expect(page.locator(`#week-${cur.index} .kind--system_design`)).toHaveCount(designs);
  });
});

test.describe("setup with level", () => {
  test("level, role and job posting are sent; posting is optional", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { d.target = null; });
    let sent: any;
    await page.route("**/api/target", (r) => { sent = r.request().postDataJSON(); return r.fulfill({ json: { ok: true } }); });
    await mockJob("/api/research", { result: { problems: 1, web_status: "ok" } });
    await mockJob("/api/campaign");
    await open(page);
    await expect(page.locator("#level option")).toHaveCount(5);
    await page.locator("#company").fill("Anthropic");
    await page.locator("#level").selectOption("senior");
    await page.locator("#role").fill("Software Engineer, Inference");
    await page.getByText("Paste the job posting (optional)").click();
    await page.locator("#job_posting").fill("We're hiring a senior engineer to scale inference.");
    await page.getByRole("button", { name: "Start preparing" }).click();
    await expect.poll(() => sent).toMatchObject({ company: "Anthropic", level: "senior", role: "Software Engineer, Inference", job_posting: "We're hiring a senior engineer to scale inference." });
  });

  test("sidebar shows the level next to the company", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    await open(page);
    await expect(page.locator(".side-target__co")).toContainText(`${d.target.company} · ${d.target.level_label}`);
  });
});

test.describe("mock interview", () => {
  test("start from Today: request, busy state, then the live panel", async ({ page, mockDashboard, mockJob }) => {
    const d = await mockDashboard();
    const job = await mockJob("/api/design/start", { steps: ["The interviewer is reading the prompt…"], holdMs: 300 });
    await open(page);
    const item = d.today_plan.items.find((i: any) => i.track === "system_design");
    const start = page.getByRole("button", { name: "Start mock interview" });
    await start.click();
    // Only this problem's buttons spin; every other design start is locked, not spinning.
    await expect(page.locator('#today button[aria-busy="true"]')).toBeVisible();
    for (const b of await page.locator('button[aria-busy="true"]').all()) await expect(b).toHaveAttribute("data-title", item.title);
    for (const b of await page.locator('button[data-action="start-design"]:not([aria-busy])').all()) await expect(b).toBeDisabled();
    d.design_session = { ...active(1), title: item.title, concepts: ["GPU batching", "streaming responses"] };
    await expect(page.locator("#session")).toBeVisible({ timeout: 8000 });
    expect(job.bodies[0]).toEqual({ title: item.title });
    await expect(page.locator("#session")).toContainText(item.title);
    await expect(page.locator("#session .msg")).toHaveCount(1);
    await expect(page.locator('[data-nav="session"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#today")).not.toHaveClass(/panel--focal/); // one focal panel at a time
    await expect(page.getByRole("button", { name: "Finish & score" })).toBeDisabled(); // nothing answered yet
  });

  test("start failure shows an error toast", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    await mockJob("/api/design/start", { error: "Finish or abandon your session on 'Design a Chat System' first." });
    await open(page);
    await page.getByRole("button", { name: "Start mock interview" }).click();
    await expect(page.locator("#toast")).toContainText("Finish or abandon");
  });

  test("an open session renders the real transcript, phase and concepts @responsive", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.design_session = active(); });
    await open(page);
    const msgs = page.locator("#session .msg");
    await expect(msgs).toHaveCount(RECORDED.transcript.length);
    await expect(msgs.first().locator(".msg__who")).toHaveText("Interviewer");
    await expect(msgs.nth(1).locator(".msg__who")).toHaveText("You");
    await expect(page.locator("#session .panel__head .meta")).toContainText("High-level design");
    await expect(page.locator("#session .note .tag")).toHaveCount(RECORDED.concepts.length);
    await expect(page.getByRole("button", { name: "Finish & score" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Resume session" })).toHaveCount(0); // KV store isn't on today's plan
    await expectNoHorizontalOverflow(page);
  });

  test("Today offers Resume for the problem already in session, and locks other starts", async ({ page, mockDashboard }) => {
    const d = await mockDashboard();
    const item = d.today_plan.items.find((i: any) => i.track === "system_design");
    d.design_session = { ...active(3), title: item.title };
    await open(page);
    await page.getByRole("button", { name: "Resume session" }).click();
    await expect(page.locator('[data-nav="session"]')).toHaveAttribute("aria-current", "true");
    await page.locator("#intel").getByRole("button", { name: /^Show all \d+$/ }).click(); // other prompts are below the fold
    const others = page.locator('#intel button[data-action="start-design"]');
    expect(await others.count()).toBeGreaterThan(0);
    for (const b of await others.all()) await expect(b).toBeDisabled();
  });

  test("sending an answer: request body, busy composer, draft cleared, focus kept", async ({ page, mockDashboard, mockJob }) => {
    const d = await mockDashboard((x) => { x.design_session = active(1); });
    const job = await mockJob("/api/design/reply", { steps: ["The interviewer is thinking…"], holdMs: 300 });
    await open(page);
    await page.locator("#design-answer").fill("Partition by consistent hashing, 3 replicas, quorum writes.");
    await page.locator("#design-answer").press("Meta+Enter");
    await expect(page.locator("#design-answer")).toBeDisabled();
    await expect(page.locator("#job-design")).toContainText("thinking");
    d.design_session = active(3);
    await expect(page.locator("#session .msg")).toHaveCount(3, { timeout: 8000 });
    expect(job.bodies[0]).toEqual({ session: RECORDED.id, text: "Partition by consistent hashing, 3 replicas, quorum writes." });
    await expect(page.locator("#design-answer")).toHaveValue("");
    await expect(page.locator("#design-answer")).toBeFocused();
  });

  test("empty answer is rejected without a request", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { d.design_session = active(1); });
    const job = await mockJob("/api/design/reply");
    await open(page);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("#toast")).toContainText("Write your answer first");
    expect(job.bodies).toHaveLength(0);
  });

  test("reply failure keeps the draft and explains", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { d.design_session = active(1); });
    await mockJob("/api/design/reply", { error: "Rate limited by the API — try again in a minute." });
    await open(page);
    await page.locator("#design-answer").fill("my long careful answer");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("#toast")).toContainText("Rate limited");
    await expect(page.locator("#design-answer")).toHaveValue("my long careful answer");
  });

  test("finish shows the scorecard, then Done dismisses it", async ({ page, mockDashboard, mockJob }) => {
    const d = await mockDashboard((x) => { x.design_session = active(); });
    const job = await mockJob("/api/design/finish", { steps: ["Grading your design against the rubric…"], result: RECORDED });
    await open(page);
    await page.getByRole("button", { name: "Finish & score" }).click();
    d.design_session = null;
    await expect(page.locator(".rubric li")).toHaveCount(5, { timeout: 8000 });
    expect(job.bodies[0]).toEqual({ session: RECORDED.id });
    for (const s of RECORDED.scorecard.scores) {
      await expect(page.locator(".rubric")).toContainText(`${s.score}/4`);
    }
    await expect(page.locator(".rubric .pips").first().locator("i.on")).toHaveCount(RECORDED.scorecard.scores[0].score);
    await expect(page.locator("#session .advice li")).toHaveCount(RECORDED.scorecard.weak_concepts.length);
    await expect(page.locator("#session")).toContainText("review");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator("#session")).toHaveCount(0);
    await expect(page.locator('[data-nav="session"]')).toHaveCount(0);
  });

  test("finish failure leaves the session open", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard((d) => { d.design_session = active(); });
    await mockJob("/api/design/finish", { error: "Model request failed (529): Overloaded" });
    await open(page);
    await page.getByRole("button", { name: "Finish & score" }).click();
    await expect(page.locator("#toast")).toContainText("Overloaded");
    await expect(page.locator("#session .msg").first()).toBeVisible();
  });

  test("abandon is two-step: cancel, Escape, then confirm", async ({ page, mockDashboard }) => {
    const d = await mockDashboard((x) => { x.design_session = active(); });
    let abandoned: any;
    await page.route("**/api/design/abandon", (r) => { abandoned = r.request().postDataJSON(); d.design_session = null; return r.fulfill({ json: { ok: true } }); });
    await open(page);
    await page.getByRole("button", { name: "Abandon" }).click();
    await page.getByRole("button", { name: "Keep going" }).click();
    await expect(page.getByRole("button", { name: "Finish & score" })).toBeVisible();
    await page.getByRole("button", { name: "Abandon" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Abandon, record nothing" })).toHaveCount(0);
    expect(abandoned).toBeUndefined();
    await page.getByRole("button", { name: "Abandon" }).click();
    await page.getByRole("button", { name: "Abandon, record nothing" }).click();
    await expect(page.locator("#toast")).toContainText("Nothing was recorded");
    expect(abandoned).toEqual({ session: RECORDED.id });
    await expect(page.locator("#session")).toHaveCount(0);
  });

  test("past mock interviews can be reopened from Activity", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.design_scorecards = [scorecardEntry()]; });
    await open(page);
    const list = page.getByRole("list", { name: "Mock interviews" });
    const avg = (RECORDED.scorecard.scores.reduce((n: number, s: any) => n + s.score, 0) / 5).toFixed(1);
    await expect(list).toContainText(`${avg}/4`);
    await list.getByRole("button", { name: "Scorecard" }).click();
    await expect(page.locator(".rubric li")).toHaveCount(5);
    await expect(page.locator('[data-nav="session"]')).toHaveAttribute("aria-current", "true");
  });

  test("intel design prompts offer Practice", async ({ page, mockDashboard, mockJob }) => {
    const d = await mockDashboard();
    const job = await mockJob("/api/design/start");
    await open(page);
    await page.locator("#intel").getByRole("button", { name: /^Show all \d+$/ }).click();
    const first = d.company.problems.find((p: any) => p.kind === "design" && p.status !== "solved");
    await page.locator("#intel .intel-row", { hasText: first.title }).getByRole("button", { name: "Practice" }).click();
    await expect.poll(() => job.bodies[0]).toEqual({ title: first.title });
  });

  test("hints given and repeated rounds are shown", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => {
      d.design_session = { ...active(), hints: 2 };
      d.company.rounds[1].count = 2;
      d.readiness.rounds[1].count = 2;
    });
    await open(page);
    await expect(page.locator("#session .panel__head .meta")).toContainText("2 hints");
    await expect(page.locator("#intel .loop li").nth(1)).toContainText("×2");
    await expect(page.locator("#readiness .round").filter({ hasText: "×2" })).toHaveCount(1);
  });

  test("a saved job posting is acknowledged when editing", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.target.has_job_posting = true; });
    await open(page);
    await page.getByRole("button", { name: "Change target" }).click();
    await page.getByText("Paste the job posting (optional)").click();
    await expect(page.locator("#target-form")).toContainText("A posting is saved");
  });

  test("week list links problems that have a page", async ({ page, mockDashboard }) => {
    const d = await mockDashboard((x) => {
      const w = x.campaign.weeks.find((w: any) => w.current);
      w.problems[0].link = "https://leetcode.com/problems/lru-cache/";
    });
    await open(page);
    const w = d.campaign.weeks.find((w: any) => w.current);
    await expect(page.locator(`#week-${w.index} .week__list a`).first()).toHaveAttribute("href", "https://leetcode.com/problems/lru-cache/");
  });

  test("hostile transcript text is shown as text", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.design_session = { ...active(1), transcript: [{ role: "interviewer", text: '<img src=x onerror="window.__xss=1">', phase: "requirements" }] }; });
    await open(page);
    await expect(page.locator("#session .msg__text")).toContainText("<img src=x");
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });

  test("session and scorecard pass axe in both themes", async ({ page, mockDashboard }) => {
    const d = await mockDashboard((x) => { x.design_session = active(); x.design_scorecards = [scorecardEntry()]; });
    await open(page);
    await scan(page);
    d.design_session = null;
    await reload(page); await page.locator("#today").waitFor();
    await page.getByRole("list", { name: "Mock interviews" }).getByRole("button", { name: "Scorecard" }).click();
    await page.locator("#theme-toggle").click();
    // Theme colours transition for 150 ms; scan the settled theme, as a reader sees it.
    await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState === "finished"));
    await scan(page);
  });
});
