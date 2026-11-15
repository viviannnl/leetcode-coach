/**
 * Chinese interface: switching, persistence, no untranslated interface text,
 * accessibility and visual baselines. Generated content stays whatever language
 * it was written in, so the leak check looks only at interface elements.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, open, reload } from "./fixtures";

const CJK = /[一-鿿]/;
// Proper nouns and symbols that stay as they are in Chinese.
// The language switcher is labelled in the language it switches to, by design.
const ALLOWED = /^(Anthropic|Switch to English|LeetCode|Claude API|Bedrock|EN|中文|⌘|↵|@[\w-]+|[\d\s/%:.–·-]+|W\d+)$/;

async function openZh(page: any, mockDashboard: any, mutate?: (d: any) => void) {
  const d = await mockDashboard((x: any) => { x.language = "zh"; mutate?.(x); });
  await page.route("**/api/settings", (r: any) => r.fulfill({ json: { ok: true, language: "zh" } }));
  await open(page);
  return d;
}

/** Interface strings that are visible or announced, minus data the user/model wrote. */
async function interfaceText(page: any): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const add = (s: string | null | undefined) => { const v = (s || "").replace(/\s+/g, " ").trim(); if (v) out.push(v); };
    const data = ".row__title, .t, .msg__text, .note p:not(.meta), .prose, .loop__name, .loop__desc, .intel-row__desc, .week__theme > span:first-child, .week__goal, .week__list a, .advice, .sources, .tag, .kind, .crumbs b, .side-target__co > span, .lc__user, .format__text, .rubric .meta, .round .kv > span, .round .meta, .intel-row__tags, .result li span";
    const skip = (el: Element) => !!el.closest(data);
    document.querySelectorAll("h1,h2,h3,label,button,summary,.label,.meta,.hint,.empty p,th").forEach((el) => {
      if (skip(el) || (el as HTMLElement).offsetParent === null) return;
      if (el.querySelector("h1,h2,h3,label,button,.label,.meta")) return; // container; children checked themselves
      add(el.textContent);
    });
    document.querySelectorAll("[placeholder],[aria-label],[title]").forEach((el) => {
      if (skip(el) || el.closest(".tag")) return;
      add(el.getAttribute("placeholder")); add(el.getAttribute("aria-label"));
    });
    return out;
  });
}

test.describe("Chinese interface @responsive", () => {
  test("no untranslated interface text on the dashboard", async ({ page, mockDashboard }) => {
    await openZh(page, mockDashboard);
    const leaks = (await interfaceText(page)).filter((s) => !CJK.test(s) && !ALLOWED.test(s));
    expect(leaks, "English left in the Chinese interface").toEqual([]);
  });

  test("no untranslated text on setup, session and scorecard", async ({ page, mockDashboard }) => {
    const d = await openZh(page, mockDashboard, (x) => {
      x.design_session = { id: "abc123", title: "Design a Rate Limiter", status: "active", difficulty: "Medium", concepts: ["token bucket"], hints: 1,
        transcript: [{ role: "interviewer", text: "Let's design a rate limiter.", phase: "requirements" }, { role: "candidate", text: "Token bucket per key." }] };
    });
    let leaks = (await interfaceText(page)).filter((s) => !CJK.test(s) && !ALLOWED.test(s));
    expect(leaks, "session").toEqual([]);
    d.design_session = null;
    await page.getByRole("button", { name: "修改目标" }).click();
    leaks = (await interfaceText(page)).filter((s) => !CJK.test(s) && !ALLOWED.test(s));
    expect(leaks, "setup").toEqual([]);
  });

  test("vocabulary is translated: levels, tracks, statuses, topics, difficulty", async ({ page, mockDashboard }) => {
    await openZh(page, mockDashboard);
    await expect(page.locator(".side-target__co")).toContainText("中级");
    await expect(page.locator("#plan .legend")).toContainText("未开始");
    await expect(page.locator("#readiness .rounds")).toContainText("实战编码");
    await expect(page.locator("#topics .topics")).toContainText("实战编码");
    await expect(page.locator("#intel .intel-row__tags").first()).toContainText("中等");
    await expect(page.locator("#plan .week__n").first()).toHaveText("第1周");
  });

  test("Chinese passes axe and declares its language", async ({ page, mockDashboard }) => {
    await openZh(page, mockDashboard);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("zh-CN");
    expect(await page.title()).toBe("LeetCode 教练");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.map((v: any) => `${v.id}: ${v.nodes.length}× ${v.nodes[0].target}`)).toEqual([]);
  });

  test("the mock interview stays marked as English", async ({ page, mockDashboard }) => {
    await openZh(page, mockDashboard, (x) => {
      x.design_session = { id: "abc123", title: "Design a Rate Limiter", status: "active", concepts: [], hints: 0, transcript: [{ role: "interviewer", text: "Hi", phase: "requirements" }] };
    });
    await expect(page.locator(".transcript")).toHaveAttribute("lang", "en");
    await expect(page.locator("#design-answer")).toHaveAttribute("placeholder", /英文/);
  });

  test("visual: dashboard in Chinese", async ({ page, mockDashboard }) => {
    await openZh(page, mockDashboard);
    await page.mouse.move(0, 0);
    await page.evaluate(() => { (document.querySelector(".toolbar") as HTMLElement).style.position = "static"; });
    await expect(page).toHaveScreenshot("dashboard-zh.png", { fullPage: true });
  });
});

test("switching language: instant, saved to the server, survives reload", async ({ page, mockDashboard }) => {
  const d = await mockDashboard();
  let saved: any;
  await page.route("**/api/settings", (r) => { saved = r.request().postDataJSON(); d.language = saved.language; return r.fulfill({ json: { ok: true, language: saved.language } }); });
  await open(page);
  await expect(page.locator("#lang-toggle")).toHaveText("中文");
  await expect(page.locator("#lang-toggle")).toHaveAttribute("aria-label", "切换到中文");
  await page.locator("#lang-toggle").click();
  await expect(page.locator("#today-h")).toHaveText("今日");
  expect(saved).toEqual({ language: "zh" });
  await reload(page); await page.locator("#today").waitFor();
  await expect(page.locator("#today-h")).toHaveText("今日");
  await page.locator("#lang-toggle").click();
  await expect(page.locator("#today-h")).toHaveText("Today");
  expect(saved).toEqual({ language: "en" });
});

test("a failed save keeps the switch and explains", async ({ page, mockDashboard }, info) => {
  info.annotations.push({ type: "allow-console-errors" });
  await mockDashboard();
  await page.route("**/api/settings", (r) => r.fulfill({ status: 500, json: { error: "Couldn't save settings." } }));
  await open(page);
  await page.locator("#lang-toggle").click();
  await expect(page.locator("#toast")).toContainText("Couldn't save settings");
});

test("dates, durations and relative times are localised", async ({ page, mockDashboard }) => {
  await mockDashboard((x) => {
    x.language = "zh";
    x.leetcode = { username: "vivianlii", synced_at: new Date(Date.now() - 3 * 3600_000).toISOString(), solved: { All: 132, Easy: 40, Medium: 88, Hard: 4 }, tags: [], last_added: [], last_other: [] };
  });
  await open(page);
  await expect(page.locator(".crumbs")).toContainText("11月25日");
  await expect(page.locator("#today .row__min").first()).toContainText("分钟");
  await expect(page.locator("#activity .lc")).toContainText("3 小时前同步");
});

test("every interface string has a Chinese translation", async ({ page, mockDashboard }) => {
  await mockDashboard();
  await open(page);
  const missing = await page.evaluate(() => {
    const S = (window as any).STRINGS ?? eval("STRINGS");
    const out: string[] = [];
    for (const [k, v] of Object.entries(S.en)) {
      if (!(k in S.zh)) { out.push(k); continue; }
      if (v && typeof v === "object") for (const sub of Object.keys(v as object)) if (!(sub in S.zh[k])) out.push(`${k}.${sub}`);
      if (typeof v === "function" && typeof S.zh[k] !== "function") out.push(`${k} (should be a function)`);
    }
    return out;
  });
  expect(missing, "keys missing from STRINGS.zh").toEqual([]);
});
