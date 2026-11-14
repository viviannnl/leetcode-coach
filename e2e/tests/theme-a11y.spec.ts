/**
 * Themes, accessibility (axe), keyboard reachability, focus visibility and the
 * per-control interaction states (hover / pressed / disabled).
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, open, reload } from "./fixtures";

const DARK_BG = "oklch(0.145 0.004 265)";

test.describe("theme", () => {
  test("dark by default, on both OS settings", async ({ browser }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ colorScheme });
      const page = await ctx.newPage();
      await page.goto("/");
      await page.locator("#today").waitFor();
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(DARK_BG);
      await ctx.close();
    }
  });

  test("a preference saved by the old dashboard is ignored", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await open(page);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  });

  test("toggle switches, persists across reloads, and relabels itself", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    const toggle = page.locator("#theme-toggle");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
    await toggle.click();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
    await reload(page);
    await page.locator("#today").waitFor();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(DARK_BG);
  });
});

test.describe("accessibility @responsive", () => {
  const scan = async (page: any) => {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const summary = r.violations.map((v: any) => `${v.id} (${v.impact}): ${v.nodes.length}× e.g. ${v.nodes[0].target.join(" ")}`);
    expect(summary, "axe violations").toEqual([]);
  };

  test("dashboard, dark", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    await scan(page);
  });

  test("dashboard, light", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await page.addInitScript(() => localStorage.setItem("lc-theme", "light"));
    await open(page);
    await scan(page);
  });

  test("dashboard with everything expanded", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    for (const w of [1, 2, 4]) await page.locator(`[data-week="${w}"]`).click();
    await page.locator("#intel").getByRole("button", { name: /^Show all \d+$/ }).click();
    await page.getByText(/What candidates say/).click();
    await page.locator("#intel summary", { hasText: "Sources" }).click();
    await scan(page);
  });

  test("setup screen", async ({ page, mockDashboard }) => {
    await mockDashboard((d) => { d.target = null; });
    await open(page);
    await scan(page);
  });
});

test.describe("keyboard", () => {
  test("every control is reachable by Tab and shows a visible focus indicator", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    const expected = await page.locator("a[href], button:not([disabled]), input, textarea, summary").evaluateAll(
      // Content of a closed <details> keeps a layout box in Chrome but is not tabbable.
      (els) => els.filter((e) => (e as HTMLElement).offsetParent !== null && !(e.parentElement?.closest("details:not([open])") && e.tagName !== "SUMMARY")).length,
    );
    const seen = new Set<string>();
    const noRing: string[] = [];
    for (let i = 0; i < expected + 5; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const ring = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
        const r = el.getBoundingClientRect();
        const key = `${el.tagName}#${el.id}.${el.className}|${el.textContent?.trim().slice(0, 30)}|${Math.round(r.top + scrollY)}:${Math.round(r.left)}`;
        return { key, ring, visible: r.width > 0 && r.height > 0 };
      });
      if (!info) continue;
      seen.add(info.key);
      if (!info.ring) noRing.push(info.key);
      expect(info.visible, `focused element is invisible: ${info.key}`).toBe(true);
    }
    expect(noRing, "focused without a visible ring").toEqual([]);
    expect(seen.size).toBeGreaterThanOrEqual(expected);
  });

  test("weeks and disclosures work from the keyboard", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    await page.locator('[data-week="1"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#week-1")).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.locator("#week-1")).toBeHidden();
    await page.locator("details.replan summary").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("details.replan")).toHaveAttribute("open", "");
  });
});

test.describe("interaction states", () => {
  const bg = (loc: any) => loc.evaluate((e: Element) => getComputedStyle(e).backgroundColor);

  test("primary button: rest, hover, pressed, disabled differ", async ({ page, mockDashboard, mockJob }) => {
    await mockDashboard();
    await mockJob("/api/feedback", { steps: ["…", "…", "…"], holdMs: 300 });
    await open(page);
    const b = page.getByRole("button", { name: "Record session" });
    const rest = await bg(b);
    await b.hover();
    await expect.poll(() => bg(b)).not.toBe(rest);
    const tf = await (async () => { await page.mouse.down(); const t = await b.evaluate((e) => getComputedStyle(e).transform); await page.mouse.up(); return t; })();
    expect(tf, "pressed state scales").not.toBe("none");
    await page.locator("#recap").fill("x");
    await b.click();
    const busy = page.locator('button[aria-busy="true"]');
    await expect(busy).toBeDisabled();
    expect(await busy.evaluate((e) => getComputedStyle(e).cursor), "busy shows progress").toBe("progress");
    const locked = page.getByRole("button", { name: "Re-plan from today" });
    await expect(locked).toBeDisabled();
    expect(await locked.evaluate((e) => getComputedStyle(e).cursor), "disabled shows not-allowed").toBe("not-allowed");
    expect(Number(await locked.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
  });

  test("nav link and week row have hover feedback", async ({ page, mockDashboard }) => {
    await mockDashboard();
    await open(page);
    for (const sel of ['[data-nav="intel"]', '[data-week="2"]', "#theme-toggle"]) {
      const el = page.locator(sel);
      const rest = await bg(el);
      await el.hover();
      await expect.poll(() => bg(el), { message: `${sel} hover` }).not.toBe(rest);
    }
  });

  test("reduced motion removes movement", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.locator("#today").waitFor();
    const dur = await page.locator(".chev").first().evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(parseFloat(dur)).toBeLessThan(0.02);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    await ctx.close();
  });
});
