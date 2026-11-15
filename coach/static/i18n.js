// Interface strings for the dashboard: English (en) and Simplified Chinese (zh).
// Loaded before app.js. Values are strings, or functions for interpolation and
// plurals. Proper nouns that users meet in English elsewhere stay English in
// both: problem titles, company round names, LeetCode, Claude, API.
"use strict";

const STRINGS = {
  en: {
    // chrome
    brand: "LeetCode Coach",
    target: "Target",
    changeTarget: "Change target",
    daysToGo: "days to go",
    workspace: "Workspace",
    sections: "Sections",
    navSession: "Design session", navToday: "Today", navPlan: "Plan", navReadiness: "Readiness",
    navIntel: "Intel", navTopics: "Topics", navActivity: "Activity",
    live: "live", done: "done", weeksShort: (n) => `${n}w`, dueCount: (n) => `${n} due`,
    provider: "Model provider", demo: "Demo", offline: "Offline", bedrock: "Bedrock", claudeApi: "Claude API",
    breadcrumb: "Breadcrumb", interviewPrep: "Interview prep", setup: "Setup",
    refreshIntel: "Refresh intel",
    toLight: "Switch to light mode", toDark: "Switch to dark mode",
    langButton: "中文", langLabel: "切换到中文",
    bannerDemo: (label) => `Demo · ${label}. Content comes from a real Claude run; buttons use the offline coach, so nothing costs credits.`,
    bannerFake: "Offline mode: plans and intel come from simple rules, not Claude. Set ANTHROPIC_API_KEY and restart for the real coach.",
    bannerBedrock: "Web reports are off on Bedrock; company intel uses the GitHub datasets only.",
    loadFailed: "Couldn't load your dashboard", tryAgain: "Try again",
    requestFailed: (status) => `Request failed (${status})`,
    starting: "Starting…",

    // setup
    setupTitle: "Who are you preparing for?", editTitle: "Change your target",
    setupLead: "Name the company and the date. The coach learns what they ask, then plans every week until then.",
    editLead: "Changing the company or level rebuilds the intel and your plan.",
    company: "Company", companyHint: "e.g. Anthropic, Google, Stripe",
    level: "Level", levelHint: "The loop changes with level: more design and leadership as you go up.",
    role: "Role", interviewDate: "Interview date", minutesADay: "Minutes a day",
    postingToggle: "Paste the job posting (optional)", posting: "Job posting",
    postingPlaceholder: "Paste the description: level, team and stated focus sharpen the research.",
    postingSaved: "A posting is saved. Paste a new one to replace it, or leave this empty to keep it.",
    saveTarget: "Save target", startPreparing: "Start preparing", cancel: "Cancel",
    errCompany: "Which company are you preparing for?", savingTarget: "Saving your target…",
    levels: { intern: "Intern", new_grad: "New grad", mid: "Mid-level", senior: "Senior", staff: "Staff+" },

    // today
    today: "Today", minutesGroup: "Minutes available today", customMinutes: "Custom minutes", minPlaceholder: "min",
    presetMin: (m) => `${m}m`, presetHour: (h) => `${h}h`,
    howMuchTime: "How much time do you have?",
    howMuchTimeBody: "The coach picks the session: new problems, due reviews, or both, following this week's plan.",
    planSession: "Plan my session", mockInterview: "Mock interview", companyPick: (c) => `${c} pick`,
    resumeSession: "Resume session", startMock: "Start mock interview",
    minutesShort: (m) => `${m}m`, itemsMeta: (n, used, total) => `${n} items · ${used}/${total}m`,
    nothingToPractise: "Nothing to practise right now", nothingToPractiseBody: "Enjoy the break, or plan again with more time.",
    howDidItGo: "How did it go?",
    recapPlaceholder: "Clone Graph clicked this time, 15 min. Rotting Oranges I needed a hint on the minute counter.",
    recordSession: "Record session", toRecord: "to record", recorded: "Recorded",
    reviewOn: (d) => `review ${d}`, couldntMatch: (s) => `Couldn't match: ${s}`,
    planAgain: "Plan again with different time", replanToday: "Re-plan today",
    errMinutes: "Pick between 5 and 600 minutes.", errRecap: "Write a line or two about how it went.",
    openOnLeetCode: (t) => `Open ${t} on LeetCode`,
    kindNew: "NEW", kindReview: "REV",

    // plan
    planTo: (d) => `Plan to ${d}`, plan: "Plan",
    addDate: "Add an interview date", addDateBody: "With a date, the coach plans every week from today to the interview.", setDate: "Set a date",
    noPlan: "No plan yet", noPlanBody: "The coach maps out each week: what to learn, what to repeat, and a final week to consolidate.", buildPlan: "Build my plan",
    weekN: (n) => `W${String(n).padStart(2, "0")}`, now: "Now", nothingScheduled: "Nothing scheduled.",
    planMeta: (done, total, weeks) => `${done}/${total} done · ${weeks} weeks`,
    staleCampaign: "Your interview date changed. Re-plan to fit the new date.",
    strategy: "Strategy", replanFromToday: "Re-plan from today",
    timeSplit: (s) => `Time split: ${s}`, planReady: "Your plan to the interview is ready.",
    trackShort: { algorithms: "ALG", practical: "PRAC", system_design: "DESIGN" },

    // session
    hints: (n) => `${n} hint${n === 1 ? "" : "s"}`, transcript: "Transcript",
    interviewer: "Interviewer", you: "You", yourAnswer: "Your answer",
    answerPlaceholder: "Talk it through as you would out loud: requirements, numbers, components, trade-offs.",
    send: "Send", toSend: "to send",
    finishHint: "Finish when you'd wrap up in a real interview; the transcript is graded.",
    answerFirst: "Answer at least once before finishing.",
    abandonConfirm: "Abandon, record nothing", keepGoing: "Keep going", abandon: "Abandon", finishScore: "Finish & score",
    scorecard: "Scorecard", ofFour: (n) => `${n} of 4`, revisit: "Revisit", strengths: "Strengths",
    scorecardFoot: "Recorded in your history; it comes back for review like any problem.", doneBtn: "Done",
    errAnswer: "Write your answer first.", abandoned: "Session abandoned. Nothing was recorded.",
    phases: { requirements: "Requirements", high_level: "High-level design", deep_dive: "Deep dive", wrap_up: "Wrap-up" },
    dimensions: {
      "Requirements & scope": "Requirements & scope", "API & data model": "API & data model",
      "High-level architecture": "High-level architecture", "Scaling & bottlenecks": "Scaling & bottlenecks",
      "Trade-offs & communication": "Trade-offs & communication",
    },

    // readiness
    readiness: "Readiness", daysLeft: "days left", dayStreak: "day streak", reviewsDue: "reviews due",
    learnWhat: (c) => `Learn what ${c} asks`,
    learnWhatBody: (web) => `Pulls LeetCode company-tag datasets from GitHub${web ? " and searches recent interview reports" : ""}.`,
    gatherIntel: "Gather intel", forCompany: (c) => `for ${c}`,
    readinessNote: (level) => `Weighted across the rounds the coach can train for a ${level.toLowerCase()} loop.`,
    ofLoop: (p) => `${p}% of loop`, notCovered: "Not covered yet", weakest: "Weakest where it counts",

    // intel
    whatAsks: (c) => `What ${c} asks`, problemsCount: (n) => `${n} problems`,
    staleLevel: (l) => `This intel was gathered for a different level. Refresh it for ${l}.`, refreshFor: (l) => `Refresh for ${l}`,
    loopLabel: (l) => `Interview loop · ${l}`, noTrack: "no track", interviewFormat: "Interview format",
    less: "Less", readMore: "Read more", noProblems: "No specific problems found yet.",
    showFewer: "Show fewer", showAll: (n) => `Show all ${n}`, practice: "Practice",
    candidatesSay: (n) => `What candidates say · ${n}`,
    sources: "Sources", sourcesSummary: (ds, web) => `Sources · ${ds} dataset${ds === 1 ? "" : "s"}, ${web} web report${web === 1 ? "" : "s"}`,
    updated: (d, w) => `Updated ${d} · web ${w}`, importance: (c) => `Importance for ${c}`,
    tagPractical: "Practical", tagDesign: "System design", tagDataset: "Dataset", tagDatasetTitle: "LeetCode company-tag dataset",
    tagReported: "Reported", tagReportedTitle: "Named in interview write-ups", tagRelated: "Related", tagRelatedTitle: "Trains the same skill",
    foundProblems: (n, web) => `Found ${n} problem${n === 1 ? "" : "s"} to know. Web: ${web}`,

    // topics
    topics: "Topics", topicsNote: (c) => `Bar = your mastery. Tick = how much ${c} emphasises it.`,

    // activity + LeetCode
    activity: "Activity", mockInterviews: "Mock interviews", avgScore: "Average rubric score", reviewsDueLabel: "Reviews due",
    recentPractice: "Recent practice", syncedTag: "Logged from your LeetCode accepted submissions",
    nothingLogged: "Nothing logged yet. Plan a session, then tell the coach how it went.",
    lcIntro: "Link your public profile: solves sync automatically and your history calibrates the plan. Read-only, no password.",
    lcUsername: "LeetCode username", lcPlaceholder: "username", link: "Link", sync: "Sync", unlink: "Unlink",
    lcStats: "Lifetime solved on LeetCode", solved: "solved", easy: "easy", medium: "medium", hard: "hard",
    synced: (when) => `Synced ${when}`, logged: (s) => `logged ${s}`,
    otherSolves: (n) => `${n} other recent solve${n === 1 ? "" : "s"} not on your plan`,
    errUsername: "Enter your LeetCode username (letters, digits, - and _).",
    lcLogged: (n, list) => `Logged ${n} solve${n === 1 ? "" : "s"} from LeetCode: ${list}`,
    lcUpToDate: (u) => `@${u} is up to date. No new solves on your plan.`,
    lcUnlinked: "LeetCode unlinked. Your logged history stays.",
    never: "never", justNow: "just now", minAgo: (n) => `${n} min ago`, hAgo: (n) => `${n} h ago`,

    // shared vocab
    status: { new: "Not started", in_progress: "In progress", solved: "Solved", due: "Review due" },
    outcome: {
      solved_independently: "Solved", solved_with_hints: "With hints", viewed_solution: "Read solution",
      gave_up: "Gave up", reviewed_easily: "Reviewed", struggled: "Struggled",
    },
    tracks: { algorithms: "Algorithms", practical: "Practical coding", system_design: "System design", behavioral: "Behavioral", code_review: "Code review", other: "Other" },
    difficulty: { Easy: "Easy", Medium: "Medium", Hard: "Hard" },
    topicNames: {},
  },

  zh: {
    brand: "LeetCode 教练",
    target: "目标",
    changeTarget: "修改目标",
    daysToGo: "天后面试",
    workspace: "工作区",
    sections: "页面分区",
    navSession: "模拟面试", navToday: "今日", navPlan: "计划", navReadiness: "准备度",
    navIntel: "公司情报", navTopics: "知识点", navActivity: "记录",
    live: "进行中", done: "已完成", weeksShort: (n) => `${n} 周`, dueCount: (n) => `${n} 待复习`,
    provider: "模型来源", demo: "演示", offline: "离线", bedrock: "Bedrock", claudeApi: "Claude API",
    breadcrumb: "页面路径", interviewPrep: "面试准备", setup: "设置",
    refreshIntel: "更新情报",
    toLight: "切换到浅色模式", toDark: "切换到深色模式",
    langButton: "EN", langLabel: "Switch to English",
    demoLabels: { "Midway (simulated history)": "中期（模拟练习历史）", "Day one (recorded run)": "第一天（真实运行录制）" },
    bannerDemo: (label) => `演示 · ${tv("demoLabels", label)}。内容来自一次真实的 Claude 运行；按钮使用离线教练，不消耗额度。`,
    bannerFake: "离线模式：计划和情报由简单规则生成，并非 Claude。设置 ANTHROPIC_API_KEY 并重启即可使用真正的教练。",
    bannerBedrock: "Bedrock 上不支持网络搜索；公司情报仅来自 GitHub 数据集。",
    loadFailed: "无法加载面板", tryAgain: "重试",
    requestFailed: (status) => `请求失败（${status}）`,
    starting: "正在开始…",

    setupTitle: "你在准备哪家公司的面试？", editTitle: "修改目标",
    setupLead: "填写公司和面试日期。教练会了解他们考什么，然后为面试前的每一周制定计划。",
    editLead: "修改公司或职级会重新生成情报和计划。",
    company: "公司", companyHint: "例如 Anthropic、Google、Stripe",
    level: "职级", levelHint: "面试流程随职级变化：职级越高，系统设计和领导力的比重越大。",
    role: "职位", interviewDate: "面试日期", minutesADay: "每天练习（分钟）",
    postingToggle: "粘贴职位描述（可选）", posting: "职位描述",
    postingPlaceholder: "粘贴职位描述：职级、团队和岗位重点能让调研更精准。",
    postingSaved: "已保存一份职位描述。粘贴新的即可替换，留空则保留原有内容。",
    saveTarget: "保存目标", startPreparing: "开始准备", cancel: "取消",
    errCompany: "你在准备哪家公司的面试？", savingTarget: "正在保存目标…",
    levels: { intern: "实习", new_grad: "应届", mid: "中级", senior: "高级", staff: "Staff 及以上" },

    today: "今日", minutesGroup: "今天可用的时间", customMinutes: "自定义分钟数", minPlaceholder: "分钟",
    presetMin: (m) => `${m} 分钟`, presetHour: (h) => `${h} 小时`,
    howMuchTime: "今天有多少时间？",
    howMuchTimeBody: "教练会按本周计划安排练习：新题、到期复习，或两者兼有。",
    planSession: "安排今日练习", mockInterview: "模拟面试", companyPick: (c) => `${c} 精选`,
    resumeSession: "继续面试", startMock: "开始模拟面试",
    minutesShort: (m) => `${m} 分钟`, itemsMeta: (n, used, total) => `${n} 项 · ${used}/${total} 分钟`,
    nothingToPractise: "现在没有要练的", nothingToPractiseBody: "休息一下，或者给更多时间重新安排。",
    howDidItGo: "练得怎么样？",
    recapPlaceholder: "比如：Clone Graph 这次顺利，15 分钟。Rotting Oranges 的计时部分看了提示。",
    recordSession: "记录本次练习", toRecord: "记录", recorded: "已记录",
    reviewOn: (d) => `${d} 复习`, couldntMatch: (s) => `未能匹配：${s}`,
    planAgain: "换个时长重新安排", replanToday: "重新安排今日",
    errMinutes: "请选择 5 到 600 分钟。", errRecap: "写一两句练习情况吧。",
    openOnLeetCode: (t) => `在 LeetCode 打开 ${t}`,
    kindNew: "新", kindReview: "复",

    planTo: (d) => `距 ${d} 的计划`, plan: "计划",
    addDate: "添加面试日期", addDateBody: "有了日期，教练会规划从今天到面试的每一周。", setDate: "设置日期",
    noPlan: "还没有计划", noPlanBody: "教练会规划每一周：学什么、复习什么，最后一周用来巩固。", buildPlan: "生成计划",
    weekN: (n) => `第${n}周`, now: "本周", nothingScheduled: "本周没有安排。",
    planMeta: (done, total, weeks) => `已完成 ${done}/${total} · 共 ${weeks} 周`,
    staleCampaign: "面试日期已更改，请重新规划以匹配新日期。",
    strategy: "整体策略", replanFromToday: "从今天重新规划",
    timeSplit: (s) => `时间分配：${s}`, planReady: "面试计划已生成。",
    trackShort: { algorithms: "算法", practical: "实战", system_design: "设计" },

    hints: (n) => `${n} 次提示`, transcript: "面试记录",
    interviewer: "面试官", you: "你", yourAnswer: "你的回答",
    answerPlaceholder: "像面试时说出来一样写：需求、数据量、组件、取舍。（模拟面试使用英文进行）",
    send: "发送", toSend: "发送",
    finishHint: "像真实面试那样收尾时结束，系统会根据记录评分。",
    answerFirst: "至少回答一次才能结束。",
    abandonConfirm: "放弃，不记录", keepGoing: "继续面试", abandon: "放弃", finishScore: "结束并评分",
    scorecard: "评分卡", ofFour: (n) => `${n}/4 分`, revisit: "需要复习", strengths: "亮点",
    scorecardFoot: "已记入练习记录，之后会像其他题目一样安排复习。", doneBtn: "完成",
    errAnswer: "请先写下你的回答。", abandoned: "已放弃本次面试，没有记录任何内容。",
    phases: { requirements: "需求澄清", high_level: "整体设计", deep_dive: "深入探讨", wrap_up: "收尾总结" },
    dimensions: {
      "Requirements & scope": "需求与范围", "API & data model": "API 与数据模型",
      "High-level architecture": "整体架构", "Scaling & bottlenecks": "扩展与瓶颈",
      "Trade-offs & communication": "权衡与沟通",
    },

    readiness: "准备度", daysLeft: "天后面试", dayStreak: "天连续练习", reviewsDue: "待复习",
    learnWhat: (c) => `了解 ${c} 考什么`,
    learnWhatBody: (web) => `从 GitHub 获取 LeetCode 公司题库数据${web ? "，并搜索近期面经" : ""}。`,
    gatherIntel: "收集情报", forCompany: (c) => `${c}`,
    readinessNote: (level) => `按教练能训练的面试轮次加权（${level}）。`,
    ofLoop: (p) => `占面试 ${p}%`, notCovered: "暂未覆盖", weakest: "最需要加强",

    whatAsks: (c) => `${c} 考什么`, problemsCount: (n) => `${n} 道题`,
    staleLevel: (l) => `这份情报是为其他职级收集的，请为「${l}」更新。`, refreshFor: (l) => `为「${l}」更新`,
    loopLabel: (l) => `面试流程 · ${l}`, noTrack: "暂无练习", interviewFormat: "面试形式",
    less: "收起", readMore: "展开", noProblems: "暂未找到具体题目。",
    showFewer: "收起", showAll: (n) => `显示全部 ${n} 项`, practice: "练习",
    candidatesSay: (n) => `候选人经验 · ${n} 条`,
    sources: "来源", sourcesSummary: (ds, web) => `来源 · ${ds} 个数据集，${web} 篇网络面经`,
    updated: (d, w) => `更新于 ${d} · 网络搜索：${w}`, importance: (c) => `对 ${c} 的重要程度`,
    tagPractical: "实战", tagDesign: "系统设计", tagDataset: "题库", tagDatasetTitle: "LeetCode 公司标签数据集",
    tagReported: "面经提及", tagReportedTitle: "在面试经验中被提到", tagRelated: "相关题", tagRelatedTitle: "训练相同的能力",
    foundProblems: (n, web) => `找到 ${n} 道需要掌握的题。网络搜索：${web}`,

    topics: "知识点", topicsNote: (c) => `进度条为你的掌握程度，刻度为 ${c} 的重视程度。`,

    activity: "记录", mockInterviews: "模拟面试", avgScore: "评分平均分", reviewsDueLabel: "待复习",
    recentPractice: "最近练习", syncedTag: "来自你在 LeetCode 上的通过记录",
    nothingLogged: "还没有记录。安排一次练习，然后告诉教练练得怎么样。",
    lcIntro: "关联你的公开主页：通过的题目会自动同步，做题历史会用来校准计划。只读，无需密码。",
    lcUsername: "LeetCode 用户名", lcPlaceholder: "用户名", link: "关联", sync: "同步", unlink: "取消关联",
    lcStats: "LeetCode 累计通过", solved: "已解决", easy: "简单", medium: "中等", hard: "困难",
    synced: (when) => `${when}同步`, logged: (s) => `已记录 ${s}`,
    otherSolves: (n) => `另有 ${n} 道近期通过的题不在计划内`,
    errUsername: "请输入 LeetCode 用户名（字母、数字、- 和 _）。",
    lcLogged: (n, list) => `已从 LeetCode 记录 ${n} 道题：${list}`,
    lcUpToDate: (u) => `@${u} 已是最新，计划内没有新通过的题。`,
    lcUnlinked: "已取消关联 LeetCode，已记录的历史会保留。",
    never: "从未", justNow: "刚刚", minAgo: (n) => `${n} 分钟前`, hAgo: (n) => `${n} 小时前`,

    status: { new: "未开始", in_progress: "进行中", solved: "已解决", due: "待复习" },
    outcome: {
      solved_independently: "独立解出", solved_with_hints: "借助提示", viewed_solution: "看了题解",
      gave_up: "放弃", reviewed_easily: "复习顺利", struggled: "比较吃力",
    },
    tracks: { algorithms: "算法", practical: "实战编码", system_design: "系统设计", behavioral: "行为面试", code_review: "代码评审", other: "其他" },
    difficulty: { Easy: "简单", Medium: "中等", Hard: "困难" },
    topicNames: {
      "Arrays & Hashing": "数组与哈希", "Two Pointers": "双指针", "Sliding Window": "滑动窗口", "Stack": "栈",
      "Binary Search": "二分查找", "Linked List": "链表", "Trees": "树", "Tries": "字典树",
      "Heap / Priority Queue": "堆 / 优先队列", "Backtracking": "回溯", "Graphs": "图", "Advanced Graphs": "高级图论",
      "1-D Dynamic Programming": "一维动态规划", "2-D Dynamic Programming": "二维动态规划", "Greedy": "贪心",
      "Intervals": "区间", "Math & Geometry": "数学与几何", "Bit Manipulation": "位运算", "Practical Coding": "实战编码",
      "Design: Foundations": "设计：基础", "Design: Storage & Caching": "设计：存储与缓存",
      "Design: Messaging & Async": "设计：消息与异步", "Design: Product Systems": "设计：产品系统",
      "Design: Infrastructure & ML": "设计：基础设施与机器学习",
    },
  },
};

const LANGS = ["en", "zh"];
let LANG = LANGS.includes(localStorage.getItem("lc-lang")) ? localStorage.getItem("lc-lang") : "en";

function setLang(lang) {
  LANG = LANGS.includes(lang) ? lang : "en";
  localStorage.setItem("lc-lang", LANG);
  document.documentElement.lang = LANG === "zh" ? "zh-CN" : "en";
}

/** Look up an interface string; functions are called with the extra arguments. */
function t(key, ...args) {
  const v = STRINGS[LANG][key] ?? STRINGS.en[key];
  if (v === undefined) return key;
  return typeof v === "function" ? v(...args) : v;
}

/** Look up a value in one of the vocab maps (status, tracks, topics…), falling back to the raw value. */
function tv(map, value) {
  return STRINGS[LANG][map]?.[value] ?? STRINGS.en[map]?.[value] ?? value;
}

const dateLocale = () => (LANG === "zh" ? "zh-CN" : "en-US");
setLang(LANG);
