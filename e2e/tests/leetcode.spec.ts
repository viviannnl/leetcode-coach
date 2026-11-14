/** Linking, syncing and unlinking a public LeetCode profile (all requests mocked). */
import { test, expect, open, allowConsoleErrors, reload } from "./fixtures";

const LINKED = {
  username: "vivian_codes", synced_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  solved: { All: 212, Easy: 90, Medium: 105, Hard: 17 },
  tags: [{ tag: "Array", solved: 120 }, { tag: "Hash Table", solved: 66 }, { tag: "Graph", solved: 21 }],
  last_added: ["Clone Graph"], last_other: ["Count Good Strings", "Some Contest Puzzle"],
};

test.describe("LeetCode @responsive", () => {
  test("unlinked: explains itself and offers a username field", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.leetcode = null; });
    await open(page);
    const box = page.locator("#activity .lc");
    await expect(box).toContainText("Read-only, no password");
    await expect(box.getByRole("textbox", { name: "LeetCode username" })).toBeVisible();
  });

  test("linked: lifetime stats, tags, sync summary", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.leetcode = LINKED; });
    await open(page);
    const box = page.locator("#activity .lc");
    await expect(box.locator(".lc__user")).toHaveText("@vivian_codes");
    await expect(box.locator(".lc__user")).toHaveAttribute("href", "https://leetcode.com/u/vivian_codes/");
    for (const n of ["212", "90", "105", "17"]) await expect(box.locator(".lc__stats")).toContainText(n);
    await expect(box.locator(".tag")).toHaveCount(3);
    await expect(box).toContainText("Synced 5 min ago");
    await expect(box).toContainText("logged Clone Graph");
    await expect(box.getByText("2 other recent solves not on your plan")).toHaveAttribute("title", "Count Good Strings, Some Contest Puzzle");
  });
});

test("link: Enter submits, request body, busy, success toast", async ({ page, mockDashboard, mockJob }) => {
  const d = await mockDashboard((x) => { x.leetcode = null; });
  const job = await mockJob("/api/leetcode", { steps: ["Reading LeetCode profile @vivian_codes…"], holdMs: 300, result: { username: "vivian_codes", added: ["Two Sum", "Clone Graph"], other: [], solved: LINKED.solved } });
  await open(page);
  await page.locator("#lc-username").fill("@vivian_codes");
  await page.locator("#lc-username").press("Enter");
  await expect(page.locator("#lc-username")).toBeDisabled();
  await expect(page.locator("#job-leetcode")).toContainText("Reading LeetCode profile");
  d.leetcode = LINKED;
  await expect(page.locator("#toast")).toContainText("Logged 2 solves from LeetCode: Two Sum, Clone Graph");
  expect(job.bodies[0]).toEqual({ username: "vivian_codes" }); // leading @ stripped
  await expect(page.locator("#activity .lc__stats")).toBeVisible();
});

test("link: invalid username is rejected without a request", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard((d) => { d.leetcode = null; });
  const job = await mockJob("/api/leetcode");
  await open(page);
  await page.locator("#lc-username").fill("not a name!");
  await page.getByRole("button", { name: "Link" }).click();
  await expect(page.locator("#toast")).toContainText("Enter your LeetCode username");
  await expect(page.locator("#lc-username")).toBeFocused();
  expect(job.bodies).toHaveLength(0);
});

test("link: unknown profile shows the server's message", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard((d) => { d.leetcode = null; });
  await mockJob("/api/leetcode", { error: "No public LeetCode profile named 'ghost'." });
  await open(page);
  await page.locator("#lc-username").fill("ghost");
  await page.getByRole("button", { name: "Link" }).click();
  await expect(page.locator("#toast")).toContainText("No public LeetCode profile");
  await expect(page.locator("#lc-username")).toBeEnabled();
});

test("sync: up-to-date message, and failure toast", async ({ page, mockDashboard, mockJob }) => {
  await mockDashboard((d) => { d.leetcode = LINKED; });
  await mockJob("/api/leetcode/sync", { result: { username: "vivian_codes", added: [], other: [], solved: LINKED.solved } });
  await open(page);
  await page.locator("#activity").getByRole("button", { name: "Sync" }).click();
  await expect(page.locator("#toast")).toContainText("@vivian_codes is up to date");
  await page.unroute("**/api/leetcode/sync");
  await mockJob("/api/leetcode/sync", { error: "LeetCode is rate-limiting requests; try again in a few minutes." });
  await page.locator("#activity").getByRole("button", { name: "Sync" }).click();
  await expect(page.locator("#toast")).toContainText("rate-limiting");
});

test("unlink keeps history and returns to the form", async ({ page, mockDashboard }) => {
  const d = await mockDashboard((x) => { x.leetcode = LINKED; });
  let hit = false;
  await page.route("**/api/leetcode/unlink", (r) => { hit = true; d.leetcode = null; return r.fulfill({ json: { ok: true } }); });
  await open(page);
  await page.locator("#activity").getByRole("button", { name: "Unlink" }).click();
  await expect(page.locator("#toast")).toContainText("logged history stays");
  expect(hit).toBe(true);
  await expect(page.locator("#lc-username")).toBeVisible();
});

test("synced attempts are labelled in recent practice", async ({ page, mockDashboard }) => {
  await mockDashboard((d) => { d.leetcode = LINKED; d.activity[0].source = "leetcode"; });
  await open(page);
  await expect(page.locator("#activity .activity--recent li").first().locator(".tag", { hasText: "LeetCode" })).toBeVisible();
});

test("sync time formats: just now, hours, older dates", async ({ page, mockDashboard }) => {
  const d = await mockDashboard((x) => { x.leetcode = { ...LINKED, synced_at: new Date().toISOString() }; });
  await open(page);
  await expect(page.locator("#activity .lc")).toContainText("Synced just now");
  d.leetcode = { ...LINKED, synced_at: new Date(Date.now() - 3 * 3600_000).toISOString() };
  await reload(page); await page.locator("#activity").waitFor();
  await expect(page.locator("#activity .lc")).toContainText("Synced 3 h ago");
  d.leetcode = { ...LINKED, synced_at: "2026-11-01T09:00:00", last_added: [], last_other: [] };
  await reload(page); await page.locator("#activity").waitFor();
  await expect(page.locator("#activity .lc")).toContainText("Synced Nov 1");
});
