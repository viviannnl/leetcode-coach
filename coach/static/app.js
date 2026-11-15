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
const statusOf = (p) => (p.due ? "due" : p.status || "new");
const st = (s) => `<svg class="st st--${s}" viewBox="0 0 14 14" role="img" aria-label="${tv("status", s)}">${STATUS_SVG[s]}</svg>`;

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
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(dateLocale(), { ...opts, timeZone: "UTC" });
}
function fmtRange(a, b) {
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${fmtDate(a)}–${sameMonth ? Number(b.slice(8, 10)) : fmtDate(b)}`;
}
const PRACTICE_TRACKS = ["algorithms", "practical", "system_design"];
const fmtMin = (m) => (m >= 60 ? t("presetHour", (m / 60).toFixed(m % 60 ? 1 : 0)) : t("presetMin", m));
function ago(iso) {
  if (!iso) return t("never");
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("minAgo", mins);
  const h = Math.round(mins / 60);
  return h < 24 ? t("hAgo", h) : fmtDate(iso.slice(0, 10));
}
const pad2 = (n) => String(n).padStart(2, "0");
// outcome -> [tag colour, status glyph]; the label comes from i18n.
const OUTCOME_STYLE = {
  solved_independently: ["success", "solved"],
  solved_with_hints: ["info", "solved"],
  viewed_solution: ["warning", "in_progress"],
  gave_up: ["danger", "in_progress"],
  reviewed_easily: ["success", "solved"],
  struggled: ["warning", "in_progress"],
};
const outcome = (o) => [tv("outcome", o || ""), ...(OUTCOME_STYLE[o] || ["info", "new"])];
const topicName = (topic) => tv("topicNames", topic);
const levelName = (target) => tv("levels", target.level) || target.level_label;

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
  if (!res.ok) throw new Error(json.error || t("requestFailed", res.status));
  return json;
}

async function load() {
  try {
    ui.data = await api("/api/dashboard");
    ui.loadError = null;
    if (ui.data.language && ui.data.language !== LANG) setLang(ui.data.language);
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
  setBusy(key, t("starting"));
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
  if (!payload.company) { ui.setupError = t("errCompany"); render(); $("#company")?.focus(); return; }
  ui.setupError = null;
  const prev = ui.data?.target?.company;
  try {
    setBusy("setup", t("savingTarget"));
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
    toast(t("foundProblems", r.problems, r.web_status));
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
    toast(t("planReady"));
  } catch (e) {
    toast(e.message, "error");
  }
  await load();
}

async function planToday() {
  const minutes = Number(ui.minutes);
  if (!(minutes >= 5 && minutes <= 600)) { toast(t("errMinutes"), "error"); return; }
  ui.feedbackResult = null;
  try { await runJob("plan", "/api/plan", { minutes }); }
  catch (e) { toast(e.message, "error"); }
  await load();
}

async function sendRecap() {
  const text = ui.recap.trim();
  if (!text) { toast(t("errRecap"), "error"); $("#recap")?.focus(); return; }
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
  if (!text) { toast(t("errAnswer"), "error"); $("#design-answer")?.focus(); return; }
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
  try { await api("/api/design/abandon", { session: sess.id }); toast(t("abandoned")); }
  catch (e) { toast(e.message, "error"); }
  ui.designDraft = "";
  await load();
}

async function linkLeetCode() {
  const username = ui.lcUsername.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) { toast(t("errUsername"), "error"); $("#lc-username")?.focus(); return; }
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
  try { await api("/api/leetcode/unlink", {}); toast(t("lcUnlinked")); }
  catch (e) { toast(e.message, "error"); }
  await load();
}

const syncMessage = (r) => r.added?.length
  ? t("lcLogged", r.added.length, `${r.added.slice(0, 3).join(", ")}${r.added.length > 3 ? "…" : ""}`)
  : t("lcUpToDate", r.username);

async function switchLanguage() {
  const next = LANG === "zh" ? "en" : "zh";
  setLang(next);
  render(); // the interface switches at once; the saved setting tells Claude which language to write in
  try { await api("/api/settings", { language: next }); if (ui.data) ui.data.language = next; }
  catch (e) { toast(e.message, "error"); }
}

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
  return u ? `<a class="ext" href="${esc(u)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(t("openOnLeetCode", label))}">${icon("ext")}</a>` : "";
};
const titleLink = (p) => {
  const u = safeUrl(p.link || p.url);
  return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(p.title)}">${esc(p.title)}</a>` : `<span class="t" title="${esc(p.title)}">${esc(p.title)}</span>`;
};
const kindTag = (k) => `<span class="kind${k === "review" ? " kind--review" : ""}">${k === "review" ? t("kindReview") : t("kindNew")}</span>`;
const segs = (problems) => `<span class="segs" aria-hidden="true">${problems.map((p) => `<i class="s-${statusOf(p)}"></i>`).join("")}</span>`;

// ---- Views: chrome ---------------------------------------------------------

function viewSidebar(d) {
  const tg = d?.target;
  const showNav = tg && !ui.editingTarget;
  const nav = showNav ? [
    ...(d.design_session || ui.scorecard ? [["session", "chat", t("navSession"), d.design_session ? t("live") : t("done")]] : []),
    ["today", "today", t("navToday"), d.today_plan?.items.length],
    ["plan", "calendar", t("navPlan"), d.campaign ? t("weeksShort", d.campaign.weeks.length) : ""],
    ["readiness", "gauge", t("navReadiness"), d.readiness ? `${d.readiness.overall}%` : ""],
    ["intel", "target", t("navIntel"), d.company?.problems.length],
    ["topics", "layers", t("navTopics"), ""],
    ["activity", "clock", t("navActivity"), d.due_reviews?.length ? t("dueCount", d.due_reviews.length) : ""],
  ] : [];
  const p = d?.provider;
  const provider = p ? `<span class="tag ${d.demo || p.name === "fake" ? "tag--warning" : "tag--accent"}" title="${esc(t("provider"))}"><span class="dot"></span>${esc(d.demo ? t("demo") : p.name === "fake" ? t("offline") : p.name === "bedrock" ? t("bedrock") : t("claudeApi"))}</span>` : "<span></span>";
  return `
    <a class="brand" href="/"><span class="brand__mark">${icon("code")}</span>${esc(t("brand"))}</a>
    ${showNav ? `
      <div class="side-target">
        <span class="label side-meta">${esc(t("target"))}</span>
        <div class="side-target__co"><span>${esc(tg.company)} <span class="meta">· ${esc(levelName(tg))}</span></span>
          <button type="button" class="icon-btn" data-action="edit-target" aria-label="${esc(STRINGS[LANG].changeTarget)}">${icon("pencil")}</button></div>
        ${tg.interview_date ? `<span class="meta mono side-meta">${esc(fmtDate(tg.interview_date, { weekday: "short", month: "short", day: "numeric" }))}</span>
          <div class="side-count"><b>${esc(tg.days_left)}</b><span class="meta">${esc(STRINGS[LANG].daysToGo)}</span></div>` : ""}
      </div>
      <nav class="nav" aria-label="${esc(STRINGS[LANG].sections)}">
        <span class="label nav__label">${esc(STRINGS[LANG].workspace)}</span>
        ${nav.map(([id, ic, label, count]) => `<a href="#${id}" data-nav="${id}"${ui.navCurrent === id ? ' aria-current="true"' : ""}>${icon(ic)}${esc(label)}${count ? `<span class="count">${esc(count)}</span>` : ""}</a>`).join("")}
      </nav>` : ""}
    <div class="sidebar__foot">${provider}<span class="row-gap"><button class="btn btn--ghost btn--sm lang-toggle" id="lang-toggle" type="button" data-action="lang" lang="${LANG === "zh" ? "en" : "zh-CN"}" aria-label="${esc(STRINGS[LANG].langLabel)}">${esc(STRINGS[LANG].langButton)}</button><button class="icon-btn" id="theme-toggle" type="button" data-action="theme"></button></span></div>`;
}

function viewToolbar(d) {
  const tg = d?.target;
  const main = tg && !ui.editingTarget;
  const crumbs = main
    ? `<b>${esc(tg.company)}</b><span class="sep">/</span><span>${esc(t("interviewPrep"))}</span><span class="sep">/</span><span class="mono">${esc(fmtDate(d.today, { weekday: "short", month: "short", day: "numeric" }))}</span>`
    : `<b>${esc(t("setup"))}</b>`;
  const actions = main && d.company
    ? `${jobLine("research")}${btn(t("refreshIntel"), { action: "research", kind: "ghost", size: "sm", busyKey: "research", iconName: "refresh" })}`
    : "";
  return `<nav class="crumbs" aria-label="${esc(t("breadcrumb"))}">${crumbs}</nav><span class="toolbar__spacer"></span>${actions}`;
}

// ---- Views: setup ----------------------------------------------------------

function viewSetup() {
  const tg = ui.data?.target;
  const editing = ui.editingTarget && t;
  const busy = "setup" in ui.busy || "research" in ui.busy || "campaign" in ui.busy;
  return `<section class="col setup">
    <div class="panel panel--focal"><div class="panel__body">
      <div class="stack">
        <h1>${esc(editing ? t("editTitle") : t("setupTitle"))}</h1>
        <p class="lead">${esc(editing ? t("editLead") : t("setupLead"))}</p>
      </div>
      <form id="target-form" novalidate>
        <div class="field">
          <label for="company">${esc(t("company"))}</label>
          <input class="input" id="company" name="company" autocomplete="organization" value="${esc(tg?.company || "")}" required ${busy ? "disabled" : ""} aria-describedby="company-hint">
          <span class="hint" id="company-hint">${esc(t("companyHint"))}</span>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="level">${esc(t("level"))}</label>
            <select class="input" id="level" name="level" ${busy ? "disabled" : ""} aria-describedby="level-hint">
              ${(ui.data?.levels || []).map((l) => `<option value="${esc(l.id)}"${(tg?.level || "mid") === l.id ? " selected" : ""}>${esc(tv("levels", l.id) || l.label)}</option>`).join("")}
            </select>
            <span class="hint" id="level-hint">${esc(t("levelHint"))}</span>
          </div>
          <div class="field">
            <label for="role">${esc(t("role"))}</label>
            <input class="input" id="role" name="role" value="${esc(tg?.role || "Software Engineer")}" ${busy ? "disabled" : ""}>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="interview_date">${esc(t("interviewDate"))}</label>
            <input class="input mono" type="date" id="interview_date" name="interview_date" min="${esc(ui.data?.today || "")}" value="${esc(tg?.interview_date || "")}" ${busy ? "disabled" : ""}>
          </div>
          <div class="field">
            <label for="daily_minutes">${esc(t("minutesADay"))}</label>
            <input class="input mono" type="number" id="daily_minutes" name="daily_minutes" min="10" max="600" step="5" value="${esc(ui.data?.daily_minutes || 60)}" ${busy ? "disabled" : ""}>
          </div>
        </div>
        <details class="disclose"><summary>${icon("chev", "chev")}${esc(t("postingToggle"))}</summary>
          <div class="field">
            <label class="sr-only" for="job_posting">${esc(t("posting"))}</label>
            <textarea class="textarea" id="job_posting" name="job_posting" rows="6" placeholder="${esc(t("postingPlaceholder"))}" ${busy ? "disabled" : ""}></textarea>
            ${tg?.has_job_posting ? `<span class="hint">${esc(t("postingSaved"))}</span>` : ""}
          </div>
        </details>
        ${ui.setupError ? `<p class="form-error" role="alert">${esc(ui.setupError)}</p>` : ""}
        <div class="recap__actions">
          ${btn(editing ? t("saveTarget") : t("startPreparing"), { kind: "primary", type: "submit", busyKey: "setup", disabled: busy })}
          ${editing ? btn(t("cancel"), { action: "cancel-edit", kind: "ghost", disabled: busy }) : ""}
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
  return `<div class="seg" role="group" aria-label="${esc(t("minutesGroup"))}">
    ${PRESETS.map((m) => `<button type="button" data-action="minutes" data-minutes="${m}" aria-pressed="${Number(ui.minutes) === m}">${esc(m < 60 ? t("presetMin", m) : t("presetHour", m / 60))}</button>`).join("")}
    <label class="sr-only" for="${id}">${esc(t("customMinutes"))}</label>
    <input id="${id}" class="custom-min" type="number" min="5" max="600" step="5" placeholder="${esc(t("minPlaceholder"))}" value="${esc(custom)}">
  </div>`;
}

function viewToday(d) {
  const plan = d.today_plan;
  const dayLabel = fmtDate(d.today, { weekday: "long", month: "long", day: "numeric" });
  if (!plan) {
    return `<section class="panel${d.design_session || ui.scorecard ? "" : " panel--focal"}" id="today" aria-labelledby="today-h">
      <div class="panel__head"><h2 tabindex="-1" id="today-h">${esc(t("today"))}</h2><span class="meta">${esc(dayLabel)}</span></div>
      <div class="empty">
        <h3>${esc(t("howMuchTime"))}</h3>
        <p>${esc(t("howMuchTimeBody"))}</p>
        ${minutePicker("custom-min-a")}
        <div class="row-gap">${btn(t("planSession"), { action: "plan", kind: "primary", busyKey: "plan" })}${jobLine("plan")}</div>
      </div>
    </section>`;
  }

  const rows = plan.items.map((it) => {
    const s = it.status === "solved" && it.kind === "new" ? "solved" : it.kind === "review" ? "due" : it.status || "new";
    return `<li class="row${s === "solved" ? " row--done" : ""}">
      ${st(s)}
      <div>
        <div class="row__title"><span title="${esc(it.title)}">${esc(it.title)}</span>${extLink(it.link, it.title)}</div>
        <div class="row__sub">${it.track === "system_design" ? `${esc(t("mockInterview"))} · ` : ""}${esc(topicName(it.topic).replace(/^(Design: |设计：)/, ""))} · ${esc(tv("difficulty", it.difficulty))}${it.source === "company" ? ` · ${esc(t("companyPick", d.target?.company || ""))}` : ""}</div>
        ${it.reason ? `<div class="row__sub">${esc(it.reason)}</div>` : ""}
        ${it.track === "system_design" && s !== "solved" ? `<div class="row__act">${d.design_session?.title === it.title
          ? btn(t("resumeSession"), { action: "goto-session", size: "sm", iconName: "chat" })
          : btn(t("startMock"), { action: "start-design", size: "sm", iconName: "chat", busyKey: "design", disabled: !!d.design_session, data: { title: it.title } })}</div>` : ""}
      </div>
      <div class="row__right">${kindTag(it.kind)}<span class="row__min">${esc(t("minutesShort", it.estimated_minutes))}</span></div>
    </li>`;
  }).join("");

  const fr = ui.feedbackResult;
  const result = fr ? `<div class="result" role="status">
      <span class="label">${esc(t("recorded"))}</span>
      ${fr.coach_note ? `<p class="prose">${esc(fr.coach_note)}</p>` : ""}
      <ul>${fr.applied.map((a) => {
        const [label, kind, s] = outcome(a.outcome);
        return `<li>${st(s)}<span>${esc(a.title)}</span><span class="tag tag--${kind}">${esc(label)}</span>${a.next_review ? `<span class="meta mono">${esc(t("reviewOn", fmtDate(a.next_review)))}</span>` : ""}</li>`;
      }).join("")}</ul>
      ${fr.unmatched?.length ? `<p class="meta">${esc(t("couldntMatch", fr.unmatched.join(", ")))}</p>` : ""}
    </div>` : "";

  return `<section class="panel${d.design_session || ui.scorecard ? "" : " panel--focal"}" id="today" aria-labelledby="today-h">
    <div class="panel__head"><h2 tabindex="-1" id="today-h">${esc(t("today"))}</h2>
      <span class="meta mono">${esc(t("itemsMeta", plan.items.length, plan.total_minutes, plan.minutes))}</span></div>
    ${plan.coach_note ? `<div class="note"><span class="label">${esc(dayLabel)}</span><p>${esc(plan.coach_note)}</p></div>` : ""}
    ${plan.items.length ? `<ol class="rows">${rows}</ol>` : `<div class="empty"><h3>${esc(t("nothingToPractise"))}</h3><p>${esc(t("nothingToPractiseBody"))}</p></div>`}
    <div class="recap">
      <label class="label" for="recap">${esc(t("howDidItGo"))}</label>
      <textarea class="textarea" id="recap" placeholder="${esc(t("recapPlaceholder"))}" ${"feedback" in ui.busy ? "disabled" : ""}>${esc(ui.recap)}</textarea>
      <div class="recap__actions">
        ${btn(t("recordSession"), { action: "recap", kind: "primary", busyKey: "feedback" })}
        ${jobLine("feedback")}
        <span class="meta hint"><kbd>⌘</kbd> <kbd>↵</kbd> ${esc(t("toRecord"))}</span>
      </div>
    </div>
    ${result}
    <details class="replan disclose"><summary>${icon("chev", "chev")}${esc(t("planAgain"))}</summary>
      <div class="row-gap">${minutePicker("custom-min-b")}${btn(t("replanToday"), { action: "plan", size: "sm", busyKey: "plan" })}${jobLine("plan")}</div>
    </details>
  </section>`;
}

/** One bar split by track (minutes), plus a labelled legend. */
function allocationStrip(alloc) {
  if (!alloc?.length) return "";
  const total = alloc.reduce((n, a) => n + a.minutes, 0) || 1;
  return `<div class="alloc" role="img" aria-label="${esc(t("timeSplit", alloc.map((a) => `${tv("tracks", a.track)} ${fmtMin(a.minutes)}`).join(", ")))}">
    <div class="alloc__bar">${alloc.map((a) => `<i class="t-${a.track}" data-grow="${a.minutes / total}"></i>`).join("")}</div>
    <div class="alloc__legend">${alloc.map((a) => `<span><i class="t-${a.track}"></i>${esc(tv("tracks", a.track))} <b class="mono">${esc(fmtMin(a.minutes))}</b></span>`).join("")}</div>
  </div>`;
}

function viewPlan(d) {
  const c = d.campaign;
  const title = d.target.interview_date ? t("planTo", fmtDate(d.target.interview_date, { month: "short", day: "numeric" })) : t("plan");
  const head = (meta = "") => `<div class="panel__head"><h2 tabindex="-1" id="plan-h">${esc(title)}</h2>${meta}</div>`;
  if (!d.target.interview_date) {
    return `<section class="panel" id="plan" aria-labelledby="plan-h">${head()}
      <div class="empty"><h3>${esc(t("addDate"))}</h3><p>${esc(t("addDateBody"))}</p>${btn(t("setDate"), { action: "edit-target", iconName: "pencil" })}</div></section>`;
  }
  if (!c) {
    return `<section class="panel" id="plan" aria-labelledby="plan-h">${head()}
      <div class="empty"><h3>${esc(t("noPlan"))}</h3><p>${esc(t("noPlanBody"))}</p>
      <div class="row-gap">${btn(t("buildPlan"), { action: "replan", kind: "primary", busyKey: "campaign" })}${jobLine("campaign")}</div></div></section>`;
  }
  const all = c.weeks.flatMap((w) => w.problems);
  const solved = all.filter((p) => p.status === "solved").length;
  const weeks = c.weeks.map((w) => {
    const open = ui.expanded ? ui.expanded.has(w.index) : w.current;
    return `<li class="week${w.current ? " week--current" : ""}${w.past ? " week--past" : ""}">
      <button type="button" class="week__head" data-action="toggle-week" data-week="${w.index}" aria-expanded="${open}" aria-controls="week-${w.index}">
        <span class="week__n">${esc(t("weekN", w.index))}</span>
        <span class="week__dates">${esc(fmtRange(w.start, w.end))}</span>
        <span class="week__theme"><span>${esc(w.theme)}</span>${w.current ? `<span class="tag tag--accent">${esc(t("now"))}</span>` : ""}</span>
        ${segs(w.problems)}
        <span class="week__count">${w.done}/${w.problems.length}</span>
        ${icon("chev", "chev")}
      </button>
      <div class="week__body" id="week-${w.index}" ${open ? "" : "hidden"}>
        ${w.goal ? `<p class="week__goal">${esc(w.goal)}</p>` : ""}
        ${allocationStrip(w.allocation)}
        ${w.problems.length ? `<ul class="week__list">${w.problems.map((p) => {
          const s = statusOf(p);
          return `<li class="is-${s}">${st(s)}${titleLink(p)}${p.track !== "algorithms" ? `<span class="kind kind--${p.track}">${esc(tv("trackShort", p.track))}</span>` : ""}${kindTag(p.kind)}</li>`;
        }).join("")}</ul>` : '<p class="meta">' + esc(t("nothingScheduled")) + '</p>'}
      </div>
    </li>`;
  }).join("");
  return `<section class="panel" id="plan" aria-labelledby="plan-h">
    ${head(`<span class="meta mono">${esc(t("planMeta", solved, all.length, c.weeks.length))}</span>`)}
    ${c.stale ? `<div class="note"><p class="meta">${esc(t("staleCampaign"))}</p></div>` : ""}
    ${c.summary ? `<div class="note"><span class="label">${esc(t("strategy"))}</span><p class="prose">${esc(c.summary)}</p></div>` : ""}
    <ol class="weeks">${weeks}</ol>
    <div class="panel__foot">
      <div class="legend" aria-hidden="true">${["new", "in_progress", "solved", "due"].map((s) => `<span>${st(s)}${esc(tv("status", s))}</span>`).join("")}</div>
      <div class="row-gap">${jobLine("campaign")}${btn(t("replanFromToday"), { action: "replan", size: "sm", busyKey: "campaign", iconName: "refresh" })}</div>
    </div>
  </section>`;
}

// ---- Views: design session -------------------------------------------------


function viewSession(d) {
  const sess = d.design_session;
  if (sess) {
    const phase = [...sess.transcript].reverse().find((m) => m.role === "interviewer")?.phase;
    const answers = sess.transcript.filter((m) => m.role === "candidate").length;
    const msgs = sess.transcript.map((m) => `<li class="msg msg--${m.role}">
        <span class="msg__who">${esc(m.role === "interviewer" ? t("interviewer") : t("you"))}</span>
        <p class="msg__text">${esc(m.text)}</p>
      </li>`).join("");
    const confirming = ui.confirmAbandon;
    return `<section class="panel panel--focal" id="session" aria-labelledby="session-h">
      <div class="panel__head"><h2 tabindex="-1" id="session-h">${esc(t("mockInterview"))}</h2>
        <span class="meta mono">${phase ? esc(tv("phases", phase)) : ""}${sess.hints ? ` · ${esc(t("hints", sess.hints))}` : ""}</span></div>
      <div class="note">
        <span class="label">${esc(d.target.company)} · ${esc(levelName(d.target))} · ${esc(tv("difficulty", sess.difficulty || ""))}</span>
        <p>${esc(sess.title)}</p>
        ${sess.concepts?.length ? `<div class="intel-row__tags">${sess.concepts.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>` : ""}
      </div>
      <ol class="transcript" aria-label="${esc(t("transcript"))}" tabindex="0" lang="en">${msgs}</ol>
      <div class="recap">
        <label class="label" for="design-answer">${esc(t("yourAnswer"))}</label>
        <textarea class="textarea textarea--tall" id="design-answer" placeholder="${esc(t("answerPlaceholder"))}" ${"design" in ui.busy ? "disabled" : ""}>${esc(ui.designDraft)}</textarea>
        <div class="recap__actions">
          ${btn(t("send"), { action: "design-send", kind: "primary", busyKey: "design" })}
          ${jobLine("design")}
          <span class="meta hint"><kbd>⌘</kbd> <kbd>↵</kbd> ${esc(t("toSend"))}</span>
        </div>
      </div>
      <div class="panel__foot">
        <span class="meta">${esc(answers ? t("finishHint") : t("answerFirst"))}</span>
        <div class="row-gap">
          ${confirming
            ? `${btn(t("abandonConfirm"), { action: "design-abandon-confirm", kind: "ghost", size: "sm" })}${btn(t("keepGoing"), { action: "design-abandon-cancel", size: "sm" })}`
            : `${btn(t("abandon"), { action: "design-abandon", kind: "ghost", size: "sm", disabled: "design" in ui.busy })}${btn(t("finishScore"), { action: "design-finish", size: "sm", busyKey: "design", disabled: !answers })}`}
        </div>
      </div>
    </section>`;
  }
  const done = ui.scorecard;
  if (!done?.scorecard) return "";
  const c = done.scorecard;
  const [label, kind] = outcome(c.outcome);
  return `<section class="panel panel--focal" id="session" aria-labelledby="session-h">
    <div class="panel__head"><h2 tabindex="-1" id="session-h">${esc(t("scorecard"))}</h2><span class="meta mono">${done.minutes ? esc(t("minutesShort", done.minutes)) : ""}</span></div>
    <div class="note">
      <span class="label">${esc(done.title)}</span>
      <p>${esc(c.summary)}</p>
      <div class="row-gap"><span class="tag tag--${kind}">${esc(label)}</span>${c.next_review ? `<span class="meta mono">${esc(t("reviewOn", fmtDate(c.next_review)))}</span>` : ""}</div>
    </div>
    <ul class="rubric">${c.scores.map((x) => `<li>
      <div class="kv"><span>${esc(tv("dimensions", x.dimension))}</span><b>${esc(x.score)}/4</b></div>
      <span class="pips" role="img" aria-label="${esc(t("ofFour", x.score))}">${[1, 2, 3, 4].map((i) => `<i class="${i <= x.score ? "on" : ""}"></i>`).join("")}</span>
      <p class="meta">${esc(x.note)}</p>
    </li>`).join("")}</ul>
    ${c.weak_concepts?.length ? `<div class="section"><span class="label">${esc(t("revisit"))}</span><ol class="advice">${c.weak_concepts.map((w) => `<li><span>${esc(w)}</span></li>`).join("")}</ol></div>` : ""}
    ${c.strengths?.length ? `<div class="section"><span class="label">${esc(t("strengths"))}</span><div class="intel-row__tags">${c.strengths.map((w) => `<span class="tag tag--success">${esc(w)}</span>`).join("")}</div></div>` : ""}
    <div class="panel__foot"><span class="meta">${esc(t("scorecardFoot"))}</span>${btn(t("doneBtn"), { action: "dismiss-scorecard", size: "sm" })}</div>
  </section>`;
}

// ---- Views: side column ----------------------------------------------------

function viewReadiness(d) {
  const r = d.readiness;
  const stats = `<div class="stats">
      <div><b>${d.target.days_left != null && d.target.days_left >= 0 ? esc(d.target.days_left) : "—"}</b><span class="meta">${esc(t("daysLeft"))}</span></div>
      <div><b>${esc(d.streak)}</b><span class="meta">${esc(t("dayStreak"))}</span></div>
      <div><b>${esc(d.due_reviews.length)}</b><span class="meta">${esc(t("reviewsDue"))}</span></div>
    </div>`;
  if (!r) {
    return `<section class="panel" id="readiness" aria-labelledby="ready-h">
      <div class="panel__head"><h2 tabindex="-1" id="ready-h">${esc(t("readiness"))}</h2></div>
      <div class="empty"><h3>${esc(t("learnWhat", d.target.company))}</h3>
      <p>${esc(t("learnWhatBody", d.provider.web_search))}</p>
      <div class="row-gap">${btn(t("gatherIntel"), { action: "research", kind: "primary", busyKey: "research" })}${jobLine("research")}</div></div>${stats}</section>`;
  }
  return `<section class="panel" id="readiness" aria-labelledby="ready-h">
    <div class="panel__head"><h2 tabindex="-1" id="ready-h">${esc(t("readiness"))}</h2><span class="meta">${esc(t("forCompany", d.target.company))}</span></div>
    <div class="panel__body">
      <div class="ready ready--rounds">
        <div class="ready__num">${esc(r.overall)}<small>%</small></div>
        <p class="meta">${esc(t("readinessNote", levelName(d.target)))}</p>
      </div>
      <ul class="rounds">${(r.rounds || []).filter((x) => x.score != null).map((x) => `<li class="round">
        <div class="kv"><span title="${esc(x.description || "")}">${esc(x.name)}${x.count > 1 ? ` <span class="meta">×${x.count}</span>` : ""}</span>
          <b>${esc(x.score)}%</b></div>
        <div class="round__meta"><span class="kind kind--${esc(x.track)}">${esc(tv("tracks", x.track))}</span><span class="meta mono">${esc(t("ofLoop", Math.round(x.weight * 100)))}</span></div>
        ${x.score == null ? "" : bar(x.score / 100, `bar--${x.track}`)}
      </li>`).join("")}
      ${(() => {
        const un = (r.rounds || []).filter((x) => x.score == null);
        return un.length ? `<li class="round round--untracked"><div class="kv"><span>${esc(t("notCovered"))}</span><b class="meta mono">${esc(t("ofLoop", Math.round(r.untracked_weight * 100)))}</b></div>
          <p class="meta">${esc(un.map((x) => x.name).join(" · "))}</p></li>` : "";
      })()}</ul>
      ${r.weak_spots.length ? `<div class="weak"><span class="meta">${esc(t("weakest"))}</span>${r.weak_spots.map((w) => `<span class="tag tag--warning">${esc(topicName(w))}</span>`).join("")}</div>` : ""}
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
      p.kind === "practical" ? `<span class="tag tag--accent">${esc(t("tagPractical"))}</span>` : p.kind === "design" ? `<span class="tag tag--info">${esc(t("tagDesign"))}</span>` : `<span class="tag">${esc(tv("difficulty", p.difficulty))}</span>`,
      p.kind === "practical" ? "" : `<span class="tag">${esc(topicName(p.topic).replace(/^(Design: |设计：)/, ""))}</span>`,
      p.from_dataset ? `<span class="tag" title="${esc(t("tagDatasetTitle"))}">${esc(t("tagDataset"))}</span>` : "",
      p.from_web ? `<span class="tag tag--info" title="${esc(t("tagReportedTitle"))}">${esc(t("tagReported"))}</span>` : "",
      !p.from_dataset && !p.from_web ? `<span class="tag" title="${esc(t("tagRelatedTitle"))}">${esc(t("tagRelated"))}</span>` : "",
    ].join("");
    return `<li class="intel-row">
      <span class="intel-row__rank">${pad2(i + 1)}</span>
      <div>
        <div class="row__title">${st(s)}<span title="${esc(p.title)}">${esc(p.title)}</span>${extLink(p.url || p.link, p.title)}</div>
        ${p.description || p.evidence ? `<div class="intel-row__desc">${esc(p.description || p.evidence)}</div>` : ""}
        <div class="intel-row__tags">${tags}</div>
        ${p.kind === "design" && s !== "solved" && d.design_session?.title !== p.title ? `<div class="row__act">${btn(t("practice"), { action: "start-design", size: "sm", kind: "ghost", iconName: "chat", busyKey: "design", disabled: !!d.design_session, data: { title: p.title } })}</div>` : ""}
      </div>
      <div class="intel-row__w" title="${esc(t("importance", d.target.company))}">${Number(p.weight).toFixed(2)}${bar(p.weight, "bar--muted")}</div>
    </li>`;
  }).join("");
  const web = c.sources.filter((s) => s.kind === "web");
  const ds = c.sources.filter((s) => s.kind === "dataset");
  return `<section class="panel" id="intel" aria-labelledby="intel-h">
    <div class="panel__head"><h2 tabindex="-1" id="intel-h">${esc(t("whatAsks", d.target.company))}</h2><span class="meta mono">${esc(t("problemsCount", c.problems.length))}</span></div>
    ${c.stale_level ? `<div class="note note--warn" role="status"><p class="meta">${esc(t("staleLevel", levelName(d.target)))}</p>${btn(t("refreshFor", levelName(d.target)), { action: "research", size: "sm", busyKey: "research", iconName: "refresh" })}</div>` : ""}
    ${c.rounds?.length ? `<div class="note"><span class="label">${esc(t("loopLabel", levelName(d.target)))}</span><ol class="loop">${c.rounds.map((x) => `<li>
        <span class="loop__name">${esc(x.name)}${x.count > 1 ? ` <span class="meta">×${x.count}</span>` : ""}</span>
        <span class="kind kind--${esc(x.track)}">${PRACTICE_TRACKS.includes(x.track) ? esc(tv("tracks", x.track)) : `${esc(tv("tracks", x.track))} · ${esc(t("noTrack"))}`}</span>
        ${x.description ? `<span class="loop__desc">${esc(x.description)}</span>` : ""}
      </li>`).join("")}</ol></div>` : ""}
    ${c.interview_format ? `<div class="note"><span class="label">${esc(t("interviewFormat"))}</span><p class="format__text${ui.showFormat ? " is-open" : ""}">${esc(c.interview_format)}</p>
      <button type="button" class="btn btn--ghost btn--sm" data-action="toggle-format">${esc(ui.showFormat ? t("less") : t("readMore"))}</button></div>` : ""}
    ${c.problems.length ? `<ol class="rows">${rows}</ol>` : `<div class="empty"><p>${esc(t("noProblems"))}</p></div>`}
    ${c.problems.length > LIMIT ? `<button type="button" class="btn btn--ghost btn--sm more" data-action="toggle-problems">${esc(ui.showAllProblems ? t("showFewer") : t("showAll", c.problems.length))}</button>` : ""}
    ${c.advice?.length ? `<div class="section"><details class="disclose"><summary>${icon("chev", "chev")}${esc(t("candidatesSay", c.advice.length))}</summary>
      <ol class="advice">${c.advice.map((a) => `<li><span>${esc(a)}</span></li>`).join("")}</ol></details></div>` : ""}
    <div class="section">
      <details class="disclose"><summary>${icon("chev", "chev")}${esc(t("sourcesSummary", ds.length, web.length))}</summary>
        <ul class="sources" aria-label="${esc(t("sources"))}" tabindex="0">${[...ds, ...web].map((s) => {
          const u = safeUrl(s.url);
          return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}">${esc(s.title || u)}</a>` : esc(s.title)}${s.status ? ` <span class="meta">· ${esc(s.status)}</span>` : ""}</li>`;
        }).join("")}</ul>
        <p class="meta">${esc(t("updated", fmtDate(c.updated), c.web_status))}</p>
      </details>
    </div>
  </section>`;
}

function viewTopics(d) {
  const weights = Object.fromEntries((d.company?.topic_weights || []).map((tw) => [tw.topic, tw.weight]));
  const has = Object.keys(weights).length > 0;
  const sorted = [...d.topics].sort((a, b) => (weights[b.topic] || 0) - (weights[a.topic] || 0) || b.mastery - a.mastery);
  const relevant = sorted.filter((tp) => weights[tp.topic] != null || tp.solved > 0);
  const short = (relevant.length >= 4 ? relevant : sorted).slice(0, 8);
  const topics = ui.showAllTopics ? sorted : short;
  return `<section class="panel" id="topics" aria-labelledby="topics-h">
    <div class="panel__head"><h2 tabindex="-1" id="topics-h">${esc(t("topics"))}</h2><span class="meta mono">${esc(d.totals.solved)}/${esc(d.totals.total)}</span></div>
    ${has ? `<div class="note"><p class="meta">${esc(t("topicsNote", d.target.company))}</p></div>` : ""}
    <ul class="topics">${topics.map((tp) => `<li>
      <span class="t" title="${esc(topicName(tp.topic))}">${esc(topicName(tp.topic))}</span>
      ${bar(tp.mastery, "", weights[tp.topic] != null ? weights[tp.topic] : null)}
      <span class="c">${esc(tp.solved)}/${esc(tp.total)}</span>
    </li>`).join("")}</ul>
    ${sorted.length > short.length ? `<button type="button" class="btn btn--ghost btn--sm more" data-action="toggle-topics">${esc(ui.showAllTopics ? t("showFewer") : t("showAll", sorted.length))}</button>` : ""}
  </section>`;
}

function viewLeetCode(d) {
  const lc = d.leetcode;
  if (!lc) {
    return `<div class="note lc">
      <span class="label" id="lc-h">LeetCode</span>
      <p class="meta">${esc(t("lcIntro"))}</p>
      <div class="lc__form">
        <label class="sr-only" for="lc-username">${esc(t("lcUsername"))}</label>
        <input class="input" id="lc-username" placeholder="${esc(t("lcPlaceholder"))}" autocomplete="off" spellcheck="false" value="${esc(ui.lcUsername)}" ${"leetcode" in ui.busy ? "disabled" : ""}>
        ${btn(t("link"), { action: "lc-link", size: "sm", busyKey: "leetcode" })}
      </div>
      ${jobLine("leetcode")}
    </div>`;
  }
  const s = lc.solved || {};
  return `<div class="note lc">
    <div class="lc__head"><span class="row-gap"><span class="label" id="lc-h">LeetCode</span><a class="mono lc__user" href="${esc(safeUrl(`https://leetcode.com/u/${lc.username}/`))}" target="_blank" rel="noopener noreferrer">@${esc(lc.username)}</a></span>
      <span class="row-gap">${jobLine("leetcode")}${btn(t("sync"), { action: "lc-sync", kind: "ghost", size: "sm", busyKey: "leetcode", iconName: "refresh" })}${btn(t("unlink"), { action: "lc-unlink", kind: "ghost", size: "sm", disabled: "leetcode" in ui.busy })}</span></div>
    <div class="lc__stats" aria-label="${esc(t("lcStats"))}">
      <div><b class="mono">${esc(s.All ?? 0)}</b><span class="meta">${esc(t("solved"))}</span></div>
      <div><b class="mono">${esc(s.Easy ?? 0)}</b><span class="meta">${esc(t("easy"))}</span></div>
      <div><b class="mono">${esc(s.Medium ?? 0)}</b><span class="meta">${esc(t("medium"))}</span></div>
      <div><b class="mono">${esc(s.Hard ?? 0)}</b><span class="meta">${esc(t("hard"))}</span></div>
    </div>
    ${lc.tags?.length ? `<div class="intel-row__tags">${lc.tags.map((lt) => `<span class="tag">${esc(lt.tag)} <span class="mono">${esc(lt.solved)}</span></span>`).join("")}</div>` : ""}
    <p class="meta">${esc(t("synced", ago(lc.synced_at)))}${lc.last_added?.length ? ` · ${esc(t("logged", lc.last_added.join(", ")))}` : ""}${lc.last_other?.length ? ` · <span title="${esc(lc.last_other.join(", "))}">${esc(t("otherSolves", lc.last_other.length))}</span>` : ""}</p>
  </div>`;
}

function viewActivity(d) {
  const act = d.activity;
  const due = d.due_reviews;
  return `<section class="panel" id="activity" aria-labelledby="act-h">
    <div class="panel__head"><h2 tabindex="-1" id="act-h">${esc(t("activity"))}</h2>${due.length ? `<span class="meta mono">${esc(t("dueCount", due.length))}</span>` : ""}</div>
    ${viewLeetCode(d)}
    ${(d.design_scorecards || []).length ? `<div class="note"><span class="label" id="mock-h">${esc(t("mockInterviews"))}</span><ul class="rows activity activity--mock" aria-labelledby="mock-h">${d.design_scorecards.map((c) => {
      const sc = c.scorecard || {};
      const [label, kind, st2] = outcome(sc.outcome);
      const avg = sc.scores?.length ? (sc.scores.reduce((n, x) => n + x.score, 0) / sc.scores.length).toFixed(1) : "–";
      return `<li>${st(st2)}<span class="t" title="${esc(c.title)}">${esc(c.title)}</span><span class="row-gap"><span class="meta mono" title="${esc(t("avgScore"))}">${avg}/4</span><span class="tag tag--${kind}">${esc(label)}</span>${btn(t("scorecard"), { action: "show-scorecard", kind: "ghost", size: "sm", data: { id: c.id } })}</span></li>`;
    }).join("")}</ul></div>` : ""}
    ${due.length ? `<div class="note"><span class="label">${esc(t("reviewsDueLabel"))}</span><ul class="week__list">${due.map((p) => `<li>${st("due")}${titleLink(p)}</li>`).join("")}</ul></div>` : ""}
    ${act.length ? `<ul class="rows activity activity--recent" aria-label="${esc(t("recentPractice"))}">${act.slice(0, 8).map((a) => {
      const [label, kind, s] = outcome(a.outcome);
      return `<li>${st(s)}<span class="t" title="${esc(a.title)}">${esc(a.title)}</span><span class="row-gap">${a.source === "leetcode" ? `<span class="tag" title="${esc(t("syncedTag"))}">LeetCode</span>` : ""}<span class="tag tag--${kind}">${esc(label)}</span><time datetime="${esc(a.date)}">${esc(fmtDate(a.date))}</time></span></li>`;
    }).join("")}</ul>` : `<div class="empty"><p>${esc(t("nothingLogged"))}</p></div>`}
  </section>`;
}

// ---- Render ----------------------------------------------------------------

function renderChrome(d) {
  document.title = t("brand");
  $("#sidebar").setAttribute("aria-label", t("sections"));
  $("#sidebar").innerHTML = viewSidebar(d);
  $("#toolbar").innerHTML = viewToolbar(d);
  applyTheme(document.documentElement.dataset.theme || "dark");
  const banner = $("#banner");
  const p = d?.provider;
  let msg = "";
  if (d?.demo) msg = t("bannerDemo", d.demo);
  else if (p?.name === "fake") msg = t("bannerFake");
  else if (p && !p.web_search) msg = t("bannerBedrock");
  banner.hidden = !msg;
  banner.textContent = msg;
}

function render() {
  const app = $("#app");
  const d = ui.data;
  renderChrome(d);
  if (ui.loadError && !d) {
    app.className = "work work--single";
    app.innerHTML = `<section class="col"><div class="panel" role="alert"><div class="empty"><h3>${esc(t("loadFailed"))}</h3><p>${esc(ui.loadError)}</p>${btn(t("tryAgain"), { action: "reload", kind: "primary" })}</div></div></section>`;
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
  const tr = document.querySelector(".transcript");
  if (tr) tr.scrollTop = tr.scrollHeight; // newest message in view
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
  else if (a === "lang") switchLanguage();
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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const b = $("#theme-toggle");
  if (!b) return;
  const dark = theme === "dark";
  b.innerHTML = icon(dark ? "sun" : "moon");
  b.setAttribute("aria-label", dark ? t("toLight") : t("toDark"));
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
