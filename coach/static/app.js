// LeetCode Coach dashboard — vanilla JS, no build step.
// Every interpolated value goes through esc(); links through safeUrl().
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);

// Lucide icon paths (ISC license).
const ICONS = {
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  today: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  target: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
};
const icon = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Linear-style status glyphs.
const STATUS_SVG = {
  new: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  in_progress: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="currentColor"/>',
  solved: '<circle cx="7" cy="7" r="6.25" fill="currentColor"/><path class="ck" d="M4.4 7.2 6.2 9l3.4-3.8" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  due: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 1.9"/><circle cx="7" cy="7" r="1.9" fill="currentColor"/>',
};
const STATUS_LABEL = { new: "Not started", in_progress: "In progress", solved: "Solved", due: "Review due" };
const statusOf = (p) => (p.due ? "due" : p.status || "new");
const st = (s) => `<svg class="st st--${s}" viewBox="0 0 14 14" role="img" aria-label="${STATUS_LABEL[s]}">${STATUS_SVG[s]}</svg>`;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch { return ""; }
}
function fmtDate(iso, opts = { month: "short", day: "numeric" }) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}
function fmtRange(a, b) {
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${fmtDate(a)}–${sameMonth ? Number(b.slice(8, 10)) : fmtDate(b)}`;
}
const TRACK_LABEL = { algorithms: "Algorithms", practical: "Practical coding", system_design: "System design", behavioral: "Behavioral", code_review: "Code review", other: "Other" };
const TRACK_SHORT = { algorithms: "ALG", practical: "PRAC", system_design: "DESIGN" };
const PRACTICE_TRACKS = ["algorithms", "practical", "system_design"];
const fmtMin = (m) => (m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h` : `${m}m`);
function ago(iso) {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : fmtDate(iso.slice(0, 10));
}
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pad2 = (n) => String(n).padStart(2, "0");
const OUTCOME = {
  solved_independently: ["Solved", "success", "solved"],
  solved_with_hints: ["With hints", "info", "solved"],
  viewed_solution: ["Read solution", "warning", "in_progress"],
  gave_up: ["Gave up", "danger", "in_progress"],
  reviewed_easily: ["Reviewed", "success", "solved"],
  struggled: ["Struggled", "warning", "in_progress"],
};

// ---- State -----------------------------------------------------------------

const ui = {
  data: null,
  loadError: null,
  minutes: 60,
  minutesTouched: false,
  recap: "",
  feedbackResult: null,
  expanded: null, // Set of open week indexes; null = default (current week open)
  showAllProblems: false,
  showAllTopics: false,
  showFormat: false,
  designDraft: "",
  lcUsername: "",
  scorecard: null, // the just-finished design session, shown until dismissed
  editingTarget: false,
  setupError: null,
  busy: {}, // key -> progress message
};

// ---- API -------------------------------------------------------------------

async function api(path, payload) {
  const opts = payload === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
  const res = await fetch(path, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

async function load() {
  try {
    ui.data = await api("/api/dashboard");
    ui.loadError = null;
    if (!ui.minutesTouched) ui.minutes = ui.data.today_plan?.minutes || ui.data.daily_minutes || 60;
  } catch (e) {
    ui.loadError = e.message;
  }
  render();
}

function setBusy(key, msg) {
  const wasBusy = key in ui.busy;
  if (msg == null) delete ui.busy[key]; else ui.busy[key] = msg;
  // Progress text changes patch in place so typing elsewhere isn't interrupted.
  const el = document.getElementById(`job-${key}`);
  if (wasBusy && msg != null && el) { el.textContent = msg; return; }
  render();
}

/** POST to start a background job, poll until it ends. Resolves with its result. */
async function runJob(key, path, payload = {}) {
  setBusy(key, "Starting…");
  try {
    const { job } = await api(path, payload);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const j = await api(`/api/jobs/${job}`);
      if (j.status === "running") { setBusy(key, j.message); continue; }
      if (j.status === "error") throw new Error(j.error);
      return j.result;
    }
  } finally {
    delete ui.busy[key];
  }
}

function toast(msg, kind = "info") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${kind === "error" ? " toast--error" : ""}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, kind === "error" ? 7000 : 3500);
}

// ---- Actions ---------------------------------------------------------------

async function saveTarget(form) {
  const fd = new FormData(form);
  const payload = {
    company: String(fd.get("company") || "").trim(),
    interview_date: fd.get("interview_date") || null,
    daily_minutes: Number(fd.get("daily_minutes")) || null,
    level: fd.get("level") || null,
    role: String(fd.get("role") || "").trim() || null,
    job_posting: fd.has("job_posting") ? String(fd.get("job_posting") || "") : null,
  };
  if (!payload.company) { ui.setupError = "Which company are you preparing for?"; render(); $("#company")?.focus(); return; }
  ui.setupError = null;
  const prev = ui.data?.target?.company;
  try {
    setBusy("setup", "Saving your target…");
    await api("/api/target", payload);
    ui.editingTarget = false;
    await load();
    const sameCompany = prev && prev.toLowerCase() === payload.company.toLowerCase();
    // New company, new level (intel is level-specific) or no intel yet → research, then plan.
    if (!sameCompany || ui.data.needs_research || !ui.data.company) await research({ thenCampaign: true });
    else if (payload.interview_date) await replan();
  } catch (e) {
    ui.setupError = e.message;
  } finally {
    delete ui.busy.setup;
    render();
  }
}

async function research({ thenCampaign = false } = {}) {
  try {
    const r = await runJob("research", "/api/research");
    toast(`Found ${plural(r.problems, "problem")} to know. Web: ${r.web_status}`);
    await load();
    if (thenCampaign && ui.data.target?.interview_date) await replan();
  } catch (e) {
    toast(e.message, "error");
    await load();
  }
}

async function replan() {
  try {
    await runJob("campaign", "/api/campaign");
    ui.expanded = null;
    toast("Your plan to the interview is ready.");
  } catch (e) {
    toast(e.message, "error");
  }
  await load();
}

async function planToday() {
  const minutes = Number(ui.minutes);
  if (!(minutes >= 5 && minutes <= 600)) { toast("Pick between 5 and 600 minutes.", "error"); return; }
  ui.feedbackResult = null;
  try { await runJob("plan", "/api/plan", { minutes }); }
  catch (e) { toast(e.message, "error"); }
  await load();
}

async function sendRecap() {
  const text = ui.recap.trim();
  if (!text) { toast("Write a line or two about how it went.", "error"); $("#recap")?.focus(); return; }
  try {
    ui.feedbackResult = await runJob("feedback", "/api/feedback", { text });
    ui.recap = "";
  } catch (e) { toast(e.message, "error"); }
  await load();
}

async function startDesign(title) {
  ui.pendingTitle = title;
  try {
    await runJob("design", "/api/design/start", { title });
    ui.designDraft = "";
    ui.scorecard = null;
    await load();
    goTo("session");
  } catch (e) { toast(e.message, "error"); await load(); }
  finally { ui.pendingTitle = null; }
}

async function sendDesign() {
  const sess = ui.data?.design_session;
  const text = ui.designDraft.trim();
  if (!sess) return;
  if (!text) { toast("Write your answer first.", "error"); $("#design-answer")?.focus(); return; }
  try {
    await runJob("design", "/api/design/reply", { session: sess.id, text });
    ui.designDraft = "";
  } catch (e) { toast(e.message, "error"); }
  await load();
  $("#design-answer")?.focus();
}

async function finishDesign() {
  const sess = ui.data?.design_session;
  if (!sess) return;
  try {
    ui.scorecard = await runJob("design", "/api/design/finish", { session: sess.id });
    ui.designDraft = "";
  } catch (e) { toast(e.message, "error"); }
  await load();
}

async function abandonDesign() {
  const sess = ui.data?.design_session;
  if (!sess) return;
  try { await api("/api/design/abandon", { session: sess.id }); toast("Session abandoned. Nothing was recorded."); }
  catch (e) { toast(e.message, "error"); }
  ui.designDraft = "";
  await load();
}

async function linkLeetCode() {
  const username = ui.lcUsername.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) { toast("Enter your LeetCode username (letters, digits, - and _).", "error"); $("#lc-username")?.focus(); return; }
  try {
    const r = await runJob("leetcode", "/api/leetcode", { username });
    ui.lcUsername = "";
    toast(syncMessage(r));
  } catch (e) { toast(e.message, "error"); }
  await load();
}

async function syncLeetCode() {
  try { toast(syncMessage(await runJob("leetcode", "/api/leetcode/sync"))); }
  catch (e) { toast(e.message, "error"); }
  await load();
}

async function unlinkLeetCode() {
  try { await api("/api/leetcode/unlink", {}); toast("LeetCode unlinked. Your logged history stays."); }
  catch (e) { toast(e.message, "error"); }
  await load();
}

const syncMessage = (r) => r.added?.length
  ? `Logged ${plural(r.added.length, "solve")} from LeetCode: ${r.added.slice(0, 3).join(", ")}${r.added.length > 3 ? "…" : ""}`
  : `@${r.username} is up to date. No new solves on your plan.`;

// ---- Render helpers --------------------------------------------------------

function btn(label, { action, kind = "secondary", size = "", busyKey, iconName, disabled = false, type = "button", data = {} } = {}) {
  // A spinner belongs only on the control for the item being worked on; others with the same key just lock.
  const busy = busyKey && busyKey in ui.busy && (!data.title || data.title === ui.pendingTitle);
  const anyBusy = Object.keys(ui.busy).length > 0;
  const dis = disabled || busy || (busyKey && anyBusy);
  const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join("");
  return `<button type="${type}" class="btn btn--${kind}${size ? " btn--" + size : ""}" ${action ? `data-action="${action}"` : ""}${attrs} ${dis ? "disabled" : ""} ${busy ? 'aria-busy="true"' : ""}>
    ${busy ? '<span class="spinner" aria-hidden="true"></span>' : iconName ? icon(iconName) : ""}<span>${esc(label)}</span></button>`;
}
const jobLine = (key) => key in ui.busy
  ? `<span class="job" role="status"><span class="spinner" aria-hidden="true"></span><span id="job-${key}">${esc(ui.busy[key])}</span></span>` : "";
const bar = (pct, cls = "", mark = null) =>
  `<div class="bar ${cls}" role="presentation"><div class="bar__fill" data-pct="${Math.max(0, Math.min(1, pct))}"></div>${mark != null ? `<div class="bar__mark" data-mark="${mark}"></div>` : ""}</div>`;
const extLink = (url, label) => {
  const u = safeUrl(url);
  return u ? `<a class="ext" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${esc(label)} on LeetCode">${icon("ext")}</a>` : "";
};
const titleLink = (p) => {
  const u = safeUrl(p.link || p.url);
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(p.title)}">${esc(p.title)}</a>` : `<span class="t" title="${esc(p.title)}">${esc(p.title)}</span>`;
};
const kindTag = (k) => `<span class="kind${k === "review" ? " kind--review" : ""}">${k === "review" ? "REV" : "NEW"}</span>`;
const segs = (problems) => `<span class="segs" aria-hidden="true">${problems.map((p) => `<i class="s-${statusOf(p)}"></i>`).join("")}</span>`;

// ---- Views: chrome ---------------------------------------------------------

function viewSidebar(d) {
  const t = d?.target;
  const showNav = t && !ui.editingTarget;
  const nav = showNav ? [
    ...(d.design_session || ui.scorecard ? [["session", "chat", "Design session", d.design_session ? "live" : "done"]] : []),
    ["today", "today", "Today", d.today_plan?.items.length],
    ["plan", "calendar", "Plan", d.campaign ? `${d.campaign.weeks.length}w` : ""],
    ["readiness", "gauge", "Readiness", d.readiness ? `${d.readiness.overall}%` : ""],
    ["intel", "target", "Intel", d.company?.problems.length],
    ["topics", "layers", "Topics", ""],
    ["activity", "clock", "Activity", d.due_reviews?.length ? `${d.due_reviews.length} due` : ""],
  ] : [];
  const p = d?.provider;
  const provider = p ? `<span class="tag ${d.demo || p.name === "fake" ? "tag--warning" : "tag--accent"}" title="Model provider"><span class="dot"></span>${esc(d.demo ? "Demo" : p.name === "fake" ? "Offline" : p.name === "bedrock" ? "Bedrock" : "Claude API")}</span>` : "<span></span>";
  return `
    <a class="brand" href="/"><span class="brand__mark">${icon("code")}</span>LeetCode Coach</a>
    ${showNav ? `
      <div class="side-target">
        <span class="label side-meta">Target</span>
        <div class="side-target__co"><span>${esc(t.company)} <span class="meta">· ${esc(t.level_label)}</span></span>
          <button type="button" class="icon-btn" data-action="edit-target" aria-label="Change target">${icon("pencil")}</button></div>
        ${t.interview_date ? `<span class="meta mono side-meta">${esc(fmtDate(t.interview_date, { weekday: "short", month: "short", day: "numeric" }))}</span>
          <div class="side-count"><b>${esc(t.days_left)}</b><span class="meta">days to go</span></div>` : ""}
      </div>
      <nav class="nav" aria-label="Sections">
        <span class="label nav__label">Workspace</span>
        ${nav.map(([id, ic, label, count]) => `<a href="#${id}" data-nav="${id}"${ui.navCurrent === id ? ' aria-current="true"' : ""}>${icon(ic)}${esc(label)}${count ? `<span class="count">${esc(count)}</span>` : ""}</a>`).join("")}
      </nav>` : ""}
    <div class="sidebar__foot">${provider}<button class="icon-btn" id="theme-toggle" type="button" data-action="theme"></button></div>`;
}

function viewToolbar(d) {
  const t = d?.target;
  const main = t && !ui.editingTarget;
  const crumbs = main
    ? `<b>${esc(t.company)}</b><span class="sep">/</span><span>Interview prep</span><span class="sep">/</span><span class="mono">${esc(fmtDate(d.today, { weekday: "short", month: "short", day: "numeric" }))}</span>`
    : `<b>Setup</b>`;
  const actions = main && d.company
    ? `${jobLine("research")}${btn("Refresh intel", { action: "research", kind: "ghost", size: "sm", busyKey: "research", iconName: "refresh" })}`
    : "";
  return `<nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav><span class="toolbar__spacer"></span>${actions}`;
}

// ---- Views: setup ----------------------------------------------------------

function viewSetup() {
  const t = ui.data?.target;
  const editing = ui.editingTarget && t;
  const busy = "setup" in ui.busy || "research" in ui.busy || "campaign" in ui.busy;
  return `<section class="col setup">
    <div class="panel panel--focal"><div class="panel__body">
      <div class="stack">
        <h1>${editing ? "Change your target" : "Who are you preparing for?"}</h1>
        <p class="lead">${editing ? "Changing the company or level rebuilds the intel and your plan." :
          "Name the company and the date. The coach learns what they ask, then plans every week until then."}</p>
      </div>
      <form id="target-form" novalidate>
        <div class="field">
          <label for="company">Company</label>
          <input class="input" id="company" name="company" autocomplete="organization" value="${esc(t?.company || "")}" required ${busy ? "disabled" : ""} aria-describedby="company-hint">
          <span class="hint" id="company-hint">e.g. Anthropic, Google, Stripe</span>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="level">Level</label>
            <select class="input" id="level" name="level" ${busy ? "disabled" : ""} aria-describedby="level-hint">
              ${(ui.data?.levels || []).map((l) => `<option value="${esc(l.id)}"${(t?.level || "mid") === l.id ? " selected" : ""}>${esc(l.label)}</option>`).join("")}
            </select>
            <span class="hint" id="level-hint">The loop changes with level: more design and leadership as you go up.</span>
          </div>
          <div class="field">
            <label for="role">Role</label>
            <input class="input" id="role" name="role" value="${esc(t?.role || "Software Engineer")}" ${busy ? "disabled" : ""}>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="interview_date">Interview date</label>
            <input class="input mono" type="date" id="interview_date" name="interview_date" min="${esc(ui.data?.today || "")}" value="${esc(t?.interview_date || "")}" ${busy ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="daily_minutes">Minutes a day</label>
            <input class="input mono" type="number" id="daily_minutes" name="daily_minutes" min="10" max="600" step="5" value="${esc(ui.data?.daily_minutes || 60)}" ${busy ? "disabled" : ""}>
          </div>
        </div>
        <details class="disclose"><summary>${icon("chev", "chev")}Paste the job posting (optional)</summary>
          <div class="field">
            <label class="sr-only" for="job_posting">Job posting</label>
            <textarea class="textarea" id="job_posting" name="job_posting" rows="6" placeholder="Paste the description: level, team and stated focus sharpen the research." ${busy ? "disabled" : ""}></textarea>
            ${t?.has_job_posting ? '<span class="hint">A posting is saved. Paste a new one to replace it, or leave this empty to keep it.</span>' : ""}
          </div>
        </details>
        ${ui.setupError ? `<p class="form-error" role="alert">${esc(ui.setupError)}</p>` : ""}
        <div class="recap__actions">
          ${btn(editing ? "Save target" : "Start preparing", { kind: "primary", type: "submit", busyKey: "setup", disabled: busy })}
          ${editing ? btn("Cancel", { action: "cancel-edit", kind: "ghost", disabled: busy }) : ""}
          ${jobLine("setup")}${jobLine("research")}${jobLine("campaign")}
        </div>
      </form>
    </div></div>
  </section>`;
}

// ---- Views: main column ----------------------------------------------------

const PRESETS = [30, 45, 60, 90, 120];
function minutePicker(id) {
  const custom = PRESETS.includes(Number(ui.minutes)) ? "" : ui.minutes;
  return `<div class="seg" role="group" aria-label="Minutes available today">
    ${PRESETS.map((m) => `<button type="button" data-action="minutes" data-minutes="${m}" aria-pressed="${Number(ui.minutes) === m}">${m < 60 ? m + "m" : m / 60 + "h"}</button>`).join("")}
    <label class="sr-only" for="${id}">Custom minutes</label>
    <input id="${id}" class="custom-min" type="number" min="5" max="600" step="5" placeholder="min" value="${esc(custom)}">
  </div>`;
}

function viewToday(d) {
  const plan = d.today_plan;
  const dayLabel = fmtDate(d.today, { weekday: "long", month: "long", day: "numeric" });
  if (!plan) {
    return `<section class="panel${d.design_session || ui.scorecard ? "" : " panel--focal"}" id="today" aria-labelledby="today-h">
      <div class="panel__head"><h2 tabindex="-1" id="today-h">Today</h2><span class="meta">${esc(dayLabel)}</span></div>
      <div class="empty">
        <h3>How much time do you have?</h3>
        <p>The coach picks the session: new problems, due reviews, or both, following this week's plan.</p>
        ${minutePicker("custom-min-a")}
        <div class="row-gap">${btn("Plan my session", { action: "plan", kind: "primary", busyKey: "plan" })}${jobLine("plan")}</div>
      </div>
    </section>`;
  }

  const rows = plan.items.map((it) => {
    const s = it.status === "solved" && it.kind === "new" ? "solved" : it.kind === "review" ? "due" : it.status || "new";
    return `<li class="row${s === "solved" ? " row--done" : ""}">
      ${st(s)}
      <div>
        <div class="row__title"><span title="${esc(it.title)}">${esc(it.title)}</span>${extLink(it.link, it.title)}</div>
        <div class="row__sub">${it.track === "system_design" ? "Mock interview · " : ""}${esc(it.topic.replace(/^Design: /, ""))} · ${esc(it.difficulty)}${it.source === "company" ? ` · ${esc(d.target?.company || "company")} pick` : ""}</div>
        ${it.reason ? `<div class="row__sub">${esc(it.reason)}</div>` : ""}
        ${it.track === "system_design" && s !== "solved" ? `<div class="row__act">${d.design_session?.title === it.title
          ? btn("Resume session", { action: "goto-session", size: "sm", iconName: "chat" })
          : btn("Start mock interview", { action: "start-design", size: "sm", iconName: "chat", busyKey: "design", disabled: !!d.design_session, data: { title: it.title } })}</div>` : ""}
      </div>
      <div class="row__right">${kindTag(it.kind)}<span class="row__min">${esc(it.estimated_minutes)}m</span></div>
    </li>`;
  }).join("");

  const fr = ui.feedbackResult;
  const result = fr ? `<div class="result" role="status">
      <span class="label">Recorded</span>
      ${fr.coach_note ? `<p class="prose">${esc(fr.coach_note)}</p>` : ""}
      <ul>${fr.applied.map((a) => {
        const [label, kind, s] = OUTCOME[a.outcome] || [a.outcome, "info", "new"];
        return `<li>${st(s)}<span>${esc(a.title)}</span><span class="tag tag--${kind}">${esc(label)}</span>${a.next_review ? `<span class="meta mono">review ${esc(fmtDate(a.next_review))}</span>` : ""}</li>`;
      }).join("")}</ul>
      ${fr.unmatched?.length ? `<p class="meta">Couldn't match: ${esc(fr.unmatched.join(", "))}</p>` : ""}
    </div>` : "";

  return `<section class="panel${d.design_session || ui.scorecard ? "" : " panel--focal"}" id="today" aria-labelledby="today-h">
    <div class="panel__head"><h2 tabindex="-1" id="today-h">Today</h2>
      <span class="meta mono">${esc(plan.items.length)} items · ${esc(plan.total_minutes)}/${esc(plan.minutes)}m</span></div>
    ${plan.coach_note ? `<div class="note"><span class="label">${esc(dayLabel)}</span><p>${esc(plan.coach_note)}</p></div>` : ""}
    ${plan.items.length ? `<ol class="rows">${rows}</ol>` : `<div class="empty"><h3>Nothing to practise right now</h3><p>Enjoy the break, or plan again with more time.</p></div>`}
    <div class="recap">
      <label class="label" for="recap">How did it go?</label>
      <textarea class="textarea" id="recap" placeholder="Clone Graph clicked this time, 15 min. Rotting Oranges I needed a hint on the minute counter." ${"feedback" in ui.busy ? "disabled" : ""}>${esc(ui.recap)}</textarea>
      <div class="recap__actions">
        ${btn("Record session", { action: "recap", kind: "primary", busyKey: "feedback" })}
        ${jobLine("feedback")}
        <span class="meta hint"><kbd>⌘</kbd> <kbd>↵</kbd> to record</span>
      </div>
    </div>
    ${result}
    <details class="replan disclose"><summary>${icon("chev", "chev")}Plan again with different time</summary>
      <div class="row-gap">${minutePicker("custom-min-b")}${btn("Re-plan today", { action: "plan", size: "sm", busyKey: "plan" })}${jobLine("plan")}</div>
    </details>
  </section>`;
}

/** One bar split by track (minutes), plus a labelled legend. */
function allocationStrip(alloc) {
  if (!alloc?.length) return "";
  const total = alloc.reduce((n, a) => n + a.minutes, 0) || 1;
  return `<div class="alloc" role="img" aria-label="Time split: ${esc(alloc.map((a) => `${TRACK_LABEL[a.track]} ${fmtMin(a.minutes)}`).join(", "))}">
    <div class="alloc__bar">${alloc.map((a) => `<i class="t-${a.track}" data-grow="${a.minutes / total}"></i>`).join("")}</div>
    <div class="alloc__legend">${alloc.map((a) => `<span><i class="t-${a.track}"></i>${esc(TRACK_LABEL[a.track])} <b class="mono">${fmtMin(a.minutes)}</b></span>`).join("")}</div>
  </div>`;
}

function viewPlan(d) {
  const c = d.campaign;
  const title = d.target.interview_date ? `Plan to ${fmtDate(d.target.interview_date, { month: "short", day: "numeric" })}` : "Plan";
  const head = (meta = "") => `<div class="panel__head"><h2 tabindex="-1" id="plan-h">${esc(title)}</h2>${meta}</div>`;
  if (!d.target.interview_date) {
    return `<section class="panel" id="plan" aria-labelledby="plan-h">${head()}
      <div class="empty"><h3>Add an interview date</h3><p>With a date, the coach plans every week from today to the interview.</p>${btn("Set a date", { action: "edit-target", iconName: "pencil" })}</div></section>`;
  }
  if (!c) {
    return `<section class="panel" id="plan" aria-labelledby="plan-h">${head()}
      <div class="empty"><h3>No plan yet</h3><p>The coach maps out each week: what to learn, what to repeat, and a final week to consolidate.</p>
      <div class="row-gap">${btn("Build my plan", { action: "replan", kind: "primary", busyKey: "campaign" })}${jobLine("campaign")}</div></div></section>`;
  }
  const all = c.weeks.flatMap((w) => w.problems);
  const solved = all.filter((p) => p.status === "solved").length;
  const weeks = c.weeks.map((w) => {
    const open = ui.expanded ? ui.expanded.has(w.index) : w.current;
    return `<li class="week${w.current ? " week--current" : ""}${w.past ? " week--past" : ""}">
      <button type="button" class="week__head" data-action="toggle-week" data-week="${w.index}" aria-expanded="${open}" aria-controls="week-${w.index}">
        <span class="week__n">W${pad2(w.index)}</span>
        <span class="week__dates">${esc(fmtRange(w.start, w.end))}</span>
        <span class="week__theme"><span>${esc(w.theme)}</span>${w.current ? '<span class="tag tag--accent">Now</span>' : ""}</span>
        ${segs(w.problems)}
        <span class="week__count">${w.done}/${w.problems.length}</span>
        ${icon("chev", "chev")}
      </button>
      <div class="week__body" id="week-${w.index}" ${open ? "" : "hidden"}>
        ${w.goal ? `<p class="week__goal">${esc(w.goal)}</p>` : ""}
        ${allocationStrip(w.allocation)}
        ${w.problems.length ? `<ul class="week__list">${w.problems.map((p) => {
          const s = statusOf(p);
          return `<li class="is-${s}">${st(s)}${titleLink(p)}${p.track !== "algorithms" ? `<span class="kind kind--${p.track}">${TRACK_SHORT[p.track]}</span>` : ""}${kindTag(p.kind)}</li>`;
        }).join("")}</ul>` : '<p class="meta">Nothing scheduled.</p>'}
      </div>
    </li>`;
  }).join("");
  return `<section class="panel" id="plan" aria-labelledby="plan-h">
    ${head(`<span class="meta mono">${solved}/${all.length} done · ${c.weeks.length} weeks</span>`)}
    ${c.stale ? `<div class="note"><p class="meta">Your interview date changed. Re-plan to fit the new date.</p></div>` : ""}
    ${c.summary ? `<div class="note"><span class="label">Strategy</span><p class="prose">${esc(c.summary)}</p></div>` : ""}
    <ol class="weeks">${weeks}</ol>
    <div class="panel__foot">
      <div class="legend" aria-hidden="true">${["new", "in_progress", "solved", "due"].map((s) => `<span>${st(s)}${STATUS_LABEL[s]}</span>`).join("")}</div>
      <div class="row-gap">${jobLine("campaign")}${btn("Re-plan from today", { action: "replan", size: "sm", busyKey: "campaign", iconName: "refresh" })}</div>
    </div>
  </section>`;
}

// ---- Views: design session -------------------------------------------------

const PHASE_LABEL = { requirements: "Requirements", high_level: "High-level design", deep_dive: "Deep dive", wrap_up: "Wrap-up" };

function viewSession(d) {
  const sess = d.design_session;
  if (sess) {
    const phase = [...sess.transcript].reverse().find((m) => m.role === "interviewer")?.phase;
    const answers = sess.transcript.filter((m) => m.role === "candidate").length;
    const msgs = sess.transcript.map((m) => `<li class="msg msg--${m.role}">
        <span class="msg__who">${m.role === "interviewer" ? "Interviewer" : "You"}</span>
        <p class="msg__text">${esc(m.text)}</p>
      </li>`).join("");
    const confirming = ui.confirmAbandon;
    return `<section class="panel panel--focal" id="session" aria-labelledby="session-h">
      <div class="panel__head"><h2 tabindex="-1" id="session-h">Mock interview</h2>
        <span class="meta mono">${phase ? esc(PHASE_LABEL[phase] || phase) : ""}${sess.hints ? ` · ${plural(sess.hints, "hint")}` : ""}</span></div>
      <div class="note">
        <span class="label">${esc(d.target.company)} · ${esc(d.target.level_label)} · ${esc(sess.difficulty || "")}</span>
        <p>${esc(sess.title)}</p>
        ${sess.concepts?.length ? `<div class="intel-row__tags">${sess.concepts.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>` : ""}
      </div>
      <ol class="transcript" aria-label="Transcript" tabindex="0">${msgs}</ol>
      <div class="recap">
        <label class="label" for="design-answer">Your answer</label>
        <textarea class="textarea textarea--tall" id="design-answer" placeholder="Talk it through as you would out loud: requirements, numbers, components, trade-offs." ${"design" in ui.busy ? "disabled" : ""}>${esc(ui.designDraft)}</textarea>
        <div class="recap__actions">
          ${btn("Send", { action: "design-send", kind: "primary", busyKey: "design" })}
          ${jobLine("design")}
          <span class="meta hint"><kbd>⌘</kbd> <kbd>↵</kbd> to send</span>
        </div>
      </div>
      <div class="panel__foot">
        <span class="meta">${answers ? "Finish when you'd wrap up in a real interview; the transcript is graded." : "Answer at least once before finishing."}</span>
        <div class="row-gap">
          ${confirming
            ? `${btn("Abandon, record nothing", { action: "design-abandon-confirm", kind: "ghost", size: "sm" })}${btn("Keep going", { action: "design-abandon-cancel", size: "sm" })}`
            : `${btn("Abandon", { action: "design-abandon", kind: "ghost", size: "sm", disabled: "design" in ui.busy })}${btn("Finish & score", { action: "design-finish", size: "sm", busyKey: "design", disabled: !answers })}`}
        </div>
      </div>
    </section>`;
  }
  const done = ui.scorecard;
  if (!done?.scorecard) return "";
  const c = done.scorecard;
  const [label, kind] = OUTCOME[c.outcome] || [c.outcome, "info"];
  return `<section class="panel panel--focal" id="session" aria-labelledby="session-h">
    <div class="panel__head"><h2 tabindex="-1" id="session-h">Scorecard</h2><span class="meta mono">${esc(done.minutes || "")}m</span></div>
    <div class="note">
      <span class="label">${esc(done.title)}</span>
      <p>${esc(c.summary)}</p>
      <div class="row-gap"><span class="tag tag--${kind}">${esc(label)}</span>${c.next_review ? `<span class="meta mono">review ${esc(fmtDate(c.next_review))}</span>` : ""}</div>
    </div>
    <ul class="rubric">${c.scores.map((x) => `<li>
      <div class="kv"><span>${esc(x.dimension)}</span><b>${esc(x.score)}/4</b></div>
      <span class="pips" role="img" aria-label="${esc(x.score)} of 4">${[1, 2, 3, 4].map((i) => `<i class="${i <= x.score ? "on" : ""}"></i>`).join("")}</span>
      <p class="meta">${esc(x.note)}</p>
    </li>`).join("")}</ul>
    ${c.weak_concepts?.length ? `<div class="section"><span class="label">Revisit</span><ol class="advice">${c.weak_concepts.map((w) => `<li><span>${esc(w)}</span></li>`).join("")}</ol></div>` : ""}
    ${c.strengths?.length ? `<div class="section"><span class="label">Strengths</span><div class="intel-row__tags">${c.strengths.map((w) => `<span class="tag tag--success">${esc(w)}</span>`).join("")}</div></div>` : ""}
    <div class="panel__foot"><span class="meta">Recorded in your history; it comes back for review like any problem.</span>${btn("Done", { action: "dismiss-scorecard", size: "sm" })}</div>
  </section>`;
}

// ---- Views: side column ----------------------------------------------------

function viewReadiness(d) {
  const r = d.readiness;
  const stats = `<div class="stats">
      <div><b>${d.target.days_left != null && d.target.days_left >= 0 ? esc(d.target.days_left) : "—"}</b><span class="meta">days left</span></div>
      <div><b>${esc(d.streak)}</b><span class="meta">day streak</span></div>
      <div><b>${esc(d.due_reviews.length)}</b><span class="meta">reviews due</span></div>
    </div>`;
  if (!r) {
    return `<section class="panel" id="readiness" aria-labelledby="ready-h">
      <div class="panel__head"><h2 tabindex="-1" id="ready-h">Readiness</h2></div>
      <div class="empty"><h3>Learn what ${esc(d.target.company)} asks</h3>
      <p>Pulls LeetCode company-tag datasets from GitHub${d.provider.web_search ? " and searches recent interview reports" : ""}.</p>
      <div class="row-gap">${btn("Gather intel", { action: "research", kind: "primary", busyKey: "research" })}${jobLine("research")}</div></div>${stats}</section>`;
  }
  return `<section class="panel" id="readiness" aria-labelledby="ready-h">
    <div class="panel__head"><h2 tabindex="-1" id="ready-h">Readiness</h2><span class="meta">for ${esc(d.target.company)}</span></div>
    <div class="panel__body">
      <div class="ready ready--rounds">
        <div class="ready__num">${esc(r.overall)}<small>%</small></div>
        <p class="meta">Weighted across the rounds the coach can train for a ${esc(d.target.level_label.toLowerCase())} loop.</p>
      </div>
      <ul class="rounds">${(r.rounds || []).filter((x) => x.score != null).map((x) => `<li class="round">
        <div class="kv"><span title="${esc(x.description || "")}">${esc(x.name)}${x.count > 1 ? ` <span class="meta">×${x.count}</span>` : ""}</span>
          <b>${esc(x.score)}%</b></div>
        <div class="round__meta"><span class="kind kind--${esc(x.track)}">${esc(TRACK_LABEL[x.track] || x.track)}</span><span class="meta mono">${Math.round(x.weight * 100)}% of loop</span></div>
        ${x.score == null ? "" : bar(x.score / 100, `bar--${x.track}`)}
      </li>`).join("")}
      ${(() => {
        const un = (r.rounds || []).filter((x) => x.score == null);
        return un.length ? `<li class="round round--untracked"><div class="kv"><span>Not covered yet</span><b class="meta mono">${Math.round(r.untracked_weight * 100)}% of loop</b></div>
          <p class="meta">${esc(un.map((x) => x.name).join(" · "))}</p></li>` : "";
      })()}</ul>
      ${r.weak_spots.length ? `<div class="weak"><span class="meta">Weakest where it counts</span>${r.weak_spots.map((w) => `<span class="tag tag--warning">${esc(w)}</span>`).join("")}</div>` : ""}
    </div>
    ${stats}
  </section>`;
}

function viewIntel(d) {
  const c = d.company;
  if (!c) return "";
  const LIMIT = 6;
  const list = ui.showAllProblems ? c.problems : c.problems.slice(0, LIMIT);
  const rows = list.map((p, i) => {
    const s = statusOf(p);
    const tags = [
      p.kind === "practical" ? '<span class="tag tag--accent">Practical</span>' : p.kind === "design" ? '<span class="tag tag--info">System design</span>' : `<span class="tag">${esc(p.difficulty)}</span>`,
      p.kind === "practical" ? "" : `<span class="tag">${esc(p.topic.replace(/^Design: /, ""))}</span>`,
      p.from_dataset ? '<span class="tag" title="LeetCode company-tag dataset">Dataset</span>' : "",
      p.from_web ? '<span class="tag tag--info" title="Named in interview write-ups">Reported</span>' : "",
      !p.from_dataset && !p.from_web ? '<span class="tag" title="Trains the same skill">Related</span>' : "",
    ].join("");
    return `<li class="intel-row">
      <span class="intel-row__rank">${pad2(i + 1)}</span>
      <div>
        <div class="row__title">${st(s)}<span title="${esc(p.title)}">${esc(p.title)}</span>${extLink(p.url || p.link, p.title)}</div>
        ${p.description || p.evidence ? `<div class="intel-row__desc">${esc(p.description || p.evidence)}</div>` : ""}
        <div class="intel-row__tags">${tags}</div>
        ${p.kind === "design" && s !== "solved" && d.design_session?.title !== p.title ? `<div class="row__act">${btn("Practice", { action: "start-design", size: "sm", kind: "ghost", iconName: "chat", busyKey: "design", disabled: !!d.design_session, data: { title: p.title } })}</div>` : ""}
      </div>
      <div class="intel-row__w" title="Importance for ${esc(d.target.company)}">${Number(p.weight).toFixed(2)}${bar(p.weight, "bar--muted")}</div>
    </li>`;
  }).join("");
  const web = c.sources.filter((s) => s.kind === "web");
  const ds = c.sources.filter((s) => s.kind === "dataset");
  return `<section class="panel" id="intel" aria-labelledby="intel-h">
    <div class="panel__head"><h2 tabindex="-1" id="intel-h">What ${esc(d.target.company)} asks</h2><span class="meta mono">${esc(c.problems.length)} problems</span></div>
    ${c.stale_level ? `<div class="note note--warn" role="status"><p class="meta">This intel was gathered for a different level. Refresh it for ${esc(d.target.level_label)}.</p>${btn("Refresh for " + d.target.level_label, { action: "research", size: "sm", busyKey: "research", iconName: "refresh" })}</div>` : ""}
    ${c.rounds?.length ? `<div class="note"><span class="label">Interview loop · ${esc(d.target.level_label)}</span><ol class="loop">${c.rounds.map((x) => `<li>
        <span class="loop__name">${esc(x.name)}${x.count > 1 ? ` <span class="meta">×${x.count}</span>` : ""}</span>
        <span class="kind kind--${esc(x.track)}">${PRACTICE_TRACKS.includes(x.track) ? esc(TRACK_LABEL[x.track]) : `${esc(TRACK_LABEL[x.track] || x.track)} · no track`}</span>
        ${x.description ? `<span class="loop__desc">${esc(x.description)}</span>` : ""}
      </li>`).join("")}</ol></div>` : ""}
    ${c.interview_format ? `<div class="note"><span class="label">Interview format</span><p class="format__text${ui.showFormat ? " is-open" : ""}">${esc(c.interview_format)}</p>
      <button type="button" class="btn btn--ghost btn--sm" data-action="toggle-format">${ui.showFormat ? "Less" : "Read more"}</button></div>` : ""}
    ${c.problems.length ? `<ol class="rows">${rows}</ol>` : `<div class="empty"><p>No specific problems found yet.</p></div>`}
    ${c.problems.length > LIMIT ? `<button type="button" class="btn btn--ghost btn--sm more" data-action="toggle-problems">${ui.showAllProblems ? "Show fewer" : `Show all ${c.problems.length}`}</button>` : ""}
    ${c.advice?.length ? `<div class="section"><details class="disclose"><summary>${icon("chev", "chev")}What candidates say · ${c.advice.length}</summary>
      <ol class="advice">${c.advice.map((a) => `<li><span>${esc(a)}</span></li>`).join("")}</ol></details></div>` : ""}
    <div class="section">
      <details class="disclose"><summary>${icon("chev", "chev")}Sources · ${esc(plural(ds.length, "dataset"))}, ${esc(plural(web.length, "web report"))}</summary>
        <ul class="sources" aria-label="Sources" tabindex="0">${[...ds, ...web].map((s) => {
          const u = safeUrl(s.url);
          return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${esc(s.title || u)}</a>` : esc(s.title)}${s.status ? ` <span class="meta">· ${esc(s.status)}</span>` : ""}</li>`;
        }).join("")}</ul>
        <p class="meta">Updated ${esc(fmtDate(c.updated))} · web ${esc(c.web_status)}</p>
      </details>
    </div>
  </section>`;
}

function viewTopics(d) {
  const weights = Object.fromEntries((d.company?.topic_weights || []).map((t) => [t.topic, t.weight]));
  const has = Object.keys(weights).length > 0;
  const sorted = [...d.topics].sort((a, b) => (weights[b.topic] || 0) - (weights[a.topic] || 0) || b.mastery - a.mastery);
  const relevant = sorted.filter((t) => weights[t.topic] != null || t.solved > 0);
  const short = (relevant.length >= 4 ? relevant : sorted).slice(0, 8);
  const topics = ui.showAllTopics ? sorted : short;
  return `<section class="panel" id="topics" aria-labelledby="topics-h">
    <div class="panel__head"><h2 tabindex="-1" id="topics-h">Topics</h2><span class="meta mono">${esc(d.totals.solved)}/${esc(d.totals.total)}</span></div>
    ${has ? `<div class="note"><p class="meta">Bar = your mastery. Tick = how much ${esc(d.target.company)} emphasises it.</p></div>` : ""}
    <ul class="topics">${topics.map((t) => `<li>
      <span class="t" title="${esc(t.topic)}">${esc(t.topic)}</span>
      ${bar(t.mastery, "", weights[t.topic] != null ? weights[t.topic] : null)}
      <span class="c">${esc(t.solved)}/${esc(t.total)}</span>
    </li>`).join("")}</ul>
    ${sorted.length > short.length ? `<button type="button" class="btn btn--ghost btn--sm more" data-action="toggle-topics">${ui.showAllTopics ? "Show fewer" : `Show all ${sorted.length}`}</button>` : ""}
  </section>`;
}

function viewLeetCode(d) {
  const lc = d.leetcode;
  if (!lc) {
    return `<div class="note lc">
      <span class="label" id="lc-h">LeetCode</span>
      <p class="meta">Link your public profile: solves sync automatically and your history calibrates the plan. Read-only, no password.</p>
      <div class="lc__form">
        <label class="sr-only" for="lc-username">LeetCode username</label>
        <input class="input" id="lc-username" placeholder="username" autocomplete="off" spellcheck="false" value="${esc(ui.lcUsername)}" ${"leetcode" in ui.busy ? "disabled" : ""}>
        ${btn("Link", { action: "lc-link", size: "sm", busyKey: "leetcode" })}
      </div>
      ${jobLine("leetcode")}
    </div>`;
  }
  const s = lc.solved || {};
  return `<div class="note lc">
    <div class="lc__head"><span class="row-gap"><span class="label" id="lc-h">LeetCode</span><a class="mono lc__user" href="${esc(safeUrl(`https://leetcode.com/u/${lc.username}/`))}" target="_blank" rel="noopener noreferrer">@${esc(lc.username)}</a></span>
      <span class="row-gap">${jobLine("leetcode")}${btn("Sync", { action: "lc-sync", kind: "ghost", size: "sm", busyKey: "leetcode", iconName: "refresh" })}${btn("Unlink", { action: "lc-unlink", kind: "ghost", size: "sm", disabled: "leetcode" in ui.busy })}</span></div>
    <div class="lc__stats" aria-label="Lifetime solved on LeetCode">
      <div><b class="mono">${esc(s.All ?? 0)}</b><span class="meta">solved</span></div>
      <div><b class="mono">${esc(s.Easy ?? 0)}</b><span class="meta">easy</span></div>
      <div><b class="mono">${esc(s.Medium ?? 0)}</b><span class="meta">medium</span></div>
      <div><b class="mono">${esc(s.Hard ?? 0)}</b><span class="meta">hard</span></div>
    </div>
    ${lc.tags?.length ? `<div class="intel-row__tags">${lc.tags.map((t) => `<span class="tag">${esc(t.tag)} <span class="mono">${esc(t.solved)}</span></span>`).join("")}</div>` : ""}
    <p class="meta">Synced ${esc(ago(lc.synced_at))}${lc.last_added?.length ? ` · logged ${esc(lc.last_added.join(", "))}` : ""}${lc.last_other?.length ? ` · <span title="${esc(lc.last_other.join(", "))}">${esc(plural(lc.last_other.length, "other recent solve"))} not on your plan</span>` : ""}</p>
  </div>`;
}

function viewActivity(d) {
  const act = d.activity;
  const due = d.due_reviews;
  return `<section class="panel" id="activity" aria-labelledby="act-h">
    <div class="panel__head"><h2 tabindex="-1" id="act-h">Activity</h2>${due.length ? `<span class="meta mono">${due.length} due</span>` : ""}</div>
    ${viewLeetCode(d)}
    ${(d.design_scorecards || []).length ? `<div class="note"><span class="label" id="mock-h">Mock interviews</span><ul class="rows activity activity--mock" aria-labelledby="mock-h">${d.design_scorecards.map((c) => {
      const sc = c.scorecard || {};
      const [label, kind, st2] = OUTCOME[sc.outcome] || [sc.outcome || "", "info", "new"];
      const avg = sc.scores?.length ? (sc.scores.reduce((n, x) => n + x.score, 0) / sc.scores.length).toFixed(1) : "–";
      return `<li>${st(st2)}<span class="t" title="${esc(c.title)}">${esc(c.title)}</span><span class="row-gap"><span class="meta mono" title="Average rubric score">${avg}/4</span><span class="tag tag--${kind}">${esc(label)}</span>${btn("Scorecard", { action: "show-scorecard", kind: "ghost", size: "sm", data: { id: c.id } })}</span></li>`;
    }).join("")}</ul></div>` : ""}
    ${due.length ? `<div class="note"><span class="label">Reviews due</span><ul class="week__list">${due.map((p) => `<li>${st("due")}${titleLink(p)}</li>`).join("")}</ul></div>` : ""}
    ${act.length ? `<ul class="rows activity activity--recent" aria-label="Recent practice">${act.slice(0, 8).map((a) => {
      const [label, kind, s] = OUTCOME[a.outcome] || [a.outcome, "info", "new"];
      return `<li>${st(s)}<span class="t" title="${esc(a.title)}">${esc(a.title)}</span><span class="row-gap">${a.source === "leetcode" ? '<span class="tag" title="Logged from your LeetCode accepted submissions">LeetCode</span>' : ""}<span class="tag tag--${kind}">${esc(label)}</span><time datetime="${esc(a.date)}">${esc(fmtDate(a.date))}</time></span></li>`;
    }).join("")}</ul>` : `<div class="empty"><p>Nothing logged yet. Plan a session, then tell the coach how it went.</p></div>`}
  </section>`;
}

// ---- Render ----------------------------------------------------------------

function renderChrome(d) {
  $("#sidebar").innerHTML = viewSidebar(d);
  $("#toolbar").innerHTML = viewToolbar(d);
  applyTheme(document.documentElement.dataset.theme || "dark");
  const banner = $("#banner");
  const p = d?.provider;
  let msg = "";
  if (d?.demo) msg = `Demo · ${d.demo}. Content comes from a real Claude run; buttons use the offline coach, so nothing costs credits.`;
  else if (p?.name === "fake") msg = "Offline mode: plans and intel come from simple rules, not Claude. Set ANTHROPIC_API_KEY and restart for the real coach.";
  else if (p && !p.web_search) msg = "Web reports are off on Bedrock; company intel uses the GitHub datasets only.";
  banner.hidden = !msg;
  banner.textContent = msg;
}

function render() {
  const app = $("#app");
  const d = ui.data;
  renderChrome(d);
  if (ui.loadError && !d) {
    app.className = "work work--single";
    app.innerHTML = `<section class="col"><div class="panel" role="alert"><div class="empty"><h3>Couldn't load your dashboard</h3><p>${esc(ui.loadError)}</p>${btn("Try again", { action: "reload", kind: "primary" })}</div></div></section>`;
    return;
  }
  if (!d) return;
  if (!d.target || ui.editingTarget) {
    app.className = "work work--single";
    app.innerHTML = viewSetup();
  } else {
    app.className = "work";
    app.innerHTML = `<section class="col">${viewSession(d)}${viewToday(d)}${viewPlan(d)}${viewActivity(d)}</section>
      <section class="col">${viewReadiness(d)}${viewIntel(d)}${viewTopics(d)}</section>`;
    observeSections();
  }
  // CSP forbids inline style attributes; set bar widths through the CSSOM.
  document.querySelectorAll("[data-pct]").forEach((el) => el.style.setProperty("--pct", el.dataset.pct));
  document.querySelectorAll("[data-mark]").forEach((el) => el.style.setProperty("--mark", el.dataset.mark));
  document.querySelectorAll("[data-grow]").forEach((el) => el.style.setProperty("--grow", el.dataset.grow));
  const t = document.querySelector(".transcript");
  if (t) t.scrollTop = t.scrollHeight; // newest message in view
}

// ---- Sidebar highlight ------------------------------------------------------
// Clicking a link selects it outright: in the two-column layout several panels
// share the same vertical position (Today and Readiness both sit at the top),
// so position alone can't tell which one you meant. Scrolling by hand releases
// that choice and the highlight follows the last panel whose top has passed
// under the toolbar, ties going to the earlier sidebar item.
const NAV_ORDER = ["session", "today", "plan", "readiness", "intel", "topics", "activity"];
let navLock = null;

function setCurrent(id) {
  ui.navCurrent = id;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === id) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
}

function spy() {
  if (navLock) return;
  const line = ($("#toolbar")?.getBoundingClientRect().bottom || 48) + 24;
  // Default to the first section that exists (the session panel only exists while one is open).
  let best = NAV_ORDER.find((id) => document.getElementById(id)) || NAV_ORDER[0];
  let bestTop = -Infinity;
  for (const id of NAV_ORDER) {
    const el = document.getElementById(id);
    if (!el) continue;
    const top = el.getBoundingClientRect().top;
    if (top <= line && top > bestTop + 1) { best = id; bestTop = top; }
  }
  // At the very bottom the last panels can never reach the line; pick the lowest visible one.
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom) {
    const visible = NAV_ORDER.filter((id) => {
      const r = document.getElementById(id)?.getBoundingClientRect();
      return r && r.top < window.innerHeight && r.bottom > line;
    });
    const left = visible.filter((id) => ["session", "today", "plan", "activity"].includes(id));
    if (left.length) best = left[left.length - 1];
  }
  if (best !== ui.navCurrent) setCurrent(best);
}

let spyQueued = false;
window.addEventListener("scroll", () => {
  if (spyQueued) return;
  spyQueued = true;
  requestAnimationFrame(() => { spyQueued = false; spy(); });
}, { passive: true });
// Only a deliberate scroll releases a clicked selection; smooth-scroll from the click doesn't.
const releaseNav = () => { navLock = null; };
["wheel", "touchmove"].forEach((ev) => window.addEventListener(ev, releaseNav, { passive: true }));
window.addEventListener("keydown", (e) => {
  // Scroll keys count unless you're typing (focus is often on a panel heading after a jump).
  const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) && !typing) releaseNav();
});

function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  navLock = id;
  setCurrent(id);
  history.replaceState(null, "", `#${id}`);
  el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  // Brief flash so you can see where you landed, even when no scroll was needed.
  el.classList.remove("is-target");
  void el.offsetWidth;
  el.classList.add("is-target");
  setTimeout(() => el.classList.remove("is-target"), 1200);
  el.querySelector("h2")?.focus({ preventScroll: true });
}

function observeSections() {
  requestAnimationFrame(() => (navLock ? setCurrent(navLock) : spy()));
}

// ---- Events ----------------------------------------------------------------

function syncMinutes() {
  document.querySelectorAll('[data-action="minutes"]').forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.minutes) === Number(ui.minutes))));
  document.querySelectorAll(".custom-min").forEach((i) => {
    if (document.activeElement !== i) i.value = PRESETS.includes(Number(ui.minutes)) ? "" : ui.minutes;
  });
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { e.preventDefault(); goTo(nav.dataset.nav); return; }
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  if (a === "minutes") { ui.minutes = Number(el.dataset.minutes); ui.minutesTouched = true; syncMinutes(); }
  else if (a === "plan") planToday();
  else if (a === "recap") sendRecap();
  else if (a === "research") research();
  else if (a === "replan") replan();
  else if (a === "toggle-week") {
    const n = Number(el.dataset.week);
    if (!ui.expanded) ui.expanded = new Set(ui.data.campaign.weeks.filter((w) => w.current).map((w) => w.index));
    const open = ui.expanded.has(n);
    open ? ui.expanded.delete(n) : ui.expanded.add(n);
    el.setAttribute("aria-expanded", String(!open));
    $(`#week-${n}`).hidden = open;
  }
  else if (a === "toggle-problems") { ui.showAllProblems = !ui.showAllProblems; render(); }
  else if (a === "start-design") startDesign(el.dataset.title);
  else if (a === "goto-session") goTo("session");
  else if (a === "design-send") sendDesign();
  else if (a === "design-finish") finishDesign();
  else if (a === "design-abandon") { ui.confirmAbandon = true; render(); }
  else if (a === "design-abandon-cancel") { ui.confirmAbandon = false; render(); }
  else if (a === "design-abandon-confirm") { ui.confirmAbandon = false; abandonDesign(); }
  else if (a === "show-scorecard") {
    ui.scorecard = (ui.data.design_scorecards || []).find((c) => c.id === el.dataset.id) || null;
    render();
    goTo("session");
  }
  else if (a === "dismiss-scorecard") { ui.scorecard = null; render(); }
  else if (a === "lc-link") linkLeetCode();
  else if (a === "lc-sync") syncLeetCode();
  else if (a === "lc-unlink") unlinkLeetCode();
  else if (a === "toggle-format") { ui.showFormat = !ui.showFormat; render(); }
  else if (a === "toggle-topics") { ui.showAllTopics = !ui.showAllTopics; render(); }
  else if (a === "edit-target") { ui.editingTarget = true; ui.setupError = null; render(); $("#company")?.focus(); }
  else if (a === "cancel-edit") { ui.editingTarget = false; render(); }
  else if (a === "theme") {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("lc-theme", next);
    applyTheme(next);
  }
  else if (a === "reload") load();
});

document.addEventListener("input", (e) => {
  if (e.target.id === "recap") ui.recap = e.target.value;
  if (e.target.id === "design-answer") ui.designDraft = e.target.value;
  if (e.target.id === "lc-username") ui.lcUsername = e.target.value;
  if (e.target.classList?.contains("custom-min")) {
    const v = Number(e.target.value);
    if (v) { ui.minutes = v; ui.minutesTouched = true; syncMinutes(); }
  }
});

document.addEventListener("submit", (e) => {
  if (e.target.id === "target-form") { e.preventDefault(); saveTarget(e.target); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ui.editingTarget && ui.data?.target && !Object.keys(ui.busy).length) { ui.editingTarget = false; render(); }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.id === "recap") { e.preventDefault(); sendRecap(); }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.id === "design-answer") { e.preventDefault(); sendDesign(); }
  if (e.key === "Enter" && e.target.id === "lc-username") { e.preventDefault(); linkLeetCode(); }
  if (e.key === "Escape" && ui.confirmAbandon) { ui.confirmAbandon = false; render(); }
});

// ---- Theme -----------------------------------------------------------------

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const b = $("#theme-toggle");
  if (!b) return;
  const dark = t === "dark";
  b.innerHTML = icon(dark ? "sun" : "moon");
  b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}
applyTheme(localStorage.getItem("lc-theme") || "dark");

// Show the skeleton only if loading takes longer than 300ms.
$("#app").hidden = true;
const skel = setTimeout(() => { $("#app").hidden = false; }, 300);
document.body.classList.add("first-paint");
load().finally(() => {
  clearTimeout(skel);
  $("#app").hidden = false;
  setTimeout(() => document.body.classList.remove("first-paint"), 700);
});
