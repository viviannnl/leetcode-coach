"""Deterministic offline stand-in for :mod:`coach.llm`.

Enabled with ``LEETCODE_COACH_PROVIDER=fake``. It makes the whole app runnable
without an API key — for UI work, demos and tests — by applying simple rules
where the real coach uses Claude's judgement. Its output is labelled as fake
wherever the user would read it.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from .roadmap import PRACTICAL_TOPIC, norm_title

_MINUTES = {"Easy": 15, "Medium": 25, "Hard": 40}

# LeetCode tag / title keyword -> roadmap topic.
_TOPIC_HINTS = [
    (("crawler", "breadth-first", "depth-first", "graph", "island", "oranges"), "Graphs"),
    (("time of functions", "stack", "parentheses"), "Stack"),
    (("duplicate file", "hash table", "anagram", "hash"), "Arrays & Hashing"),
    (("linked list", "lru"), "Linked List"),
    (("heap", "priority", "kth", "top k"), "Heap / Priority Queue"),
    (("interval", "meeting", "merge"), "Intervals"),
    (("binary search",), "Binary Search"),
    (("tree", "trie"), "Trees"),
    (("dynamic programming",), "1-D Dynamic Programming"),
    (("design",), PRACTICAL_TOPIC),
]


def _guess_topic(title: str, tags: list[str], valid: list[str]) -> str:
    hay = (title + " " + " ".join(tags)).lower()
    for keys, topic in _TOPIC_HINTS:
        if topic in valid and any(k in hay for k in keys):
            return topic
    return "Arrays & Hashing"


def _mins(difficulty: str, kind: str, topic: str = "") -> int:
    if topic == PRACTICAL_TOPIC:
        return 60
    if topic.startswith("Design:"):
        return 30 if kind == "review" else 45
    base = _MINUTES.get(difficulty, 25)
    return max(8, base // 2) if kind == "review" else base


def generate_plan(context: dict[str, Any]) -> dict[str, Any]:
    budget = int(context["available_minutes"])
    problems = {p["title"]: p for p in context["roadmap"]["problems"]}
    items: list[dict[str, Any]] = []
    used = 0

    def add(title: str, kind: str, reason: str) -> None:
        nonlocal used
        p = problems.get(title)
        if not p or any(i["title"] == title for i in items):
            return
        m = _mins(p["difficulty"], kind, p["topic"])
        if used + m > budget:
            return
        used += m
        items.append({"title": title, "kind": kind, "estimated_minutes": m, "reason": reason})

    for h in context.get("history", []):
        if h["due_for_review"]:
            add(h["title"], "review", "Due for review today.")

    week = context.get("this_week") or {}
    for w in week.get("problems", []):
        if problems.get(w["title"], {}).get("status") != "solved":
            add(w["title"], w["kind"], f"On this week's plan: {week.get('theme', '')}.")

    for p in context["roadmap"]["problems"]:
        if p["status"] == "new":
            add(p["title"], "new", "Next on your roadmap.")
        if used >= budget - 10:
            break

    return {
        "focus": "review" if items and all(i["kind"] == "review" for i in items) else "balanced",
        "coach_note": "[Offline fake coach] A rule-based plan: due reviews first, then this week's problems.",
        "items": items,
    }


def parse_feedback(context: dict[str, Any]) -> dict[str, Any]:
    text = context["feedback"]
    ref = context["reference"]
    plan_kinds = {p["title"]: p["kind"] for p in ref.get("todays_plan", [])}
    titles = list(plan_kinds) + [t for t in ref["roadmap_titles"] if t not in plan_kinds]

    sentences = re.split(r"(?<=[.!?\n])\s+", text)
    updates = []
    matched: list[str] = []
    # Longest titles first, so "Web Crawler" doesn't also match "Web Crawler Multithreaded".
    for title in sorted(titles, key=lambda t: -len(t)):
        key = norm_title(title)
        hit = next(
            (s for s in sentences if key and key in norm_title(s)
             and not any(key in m and norm_title(s).count(key) <= norm_title(s).count(m) for m in matched)),
            None,
        )
        if not hit:
            continue
        matched.append(key)
        low = hit.lower()
        review = plan_kinds.get(title) == "review"
        if "solution" in low:
            outcome = "viewed_solution"
        elif "gave up" in low or "stuck" in low:
            outcome = "gave_up"
        elif "hint" in low:
            outcome = "solved_with_hints"
        elif review and ("hard" in low or "slow" in low):
            outcome = "struggled"
        elif review:
            outcome = "reviewed_easily"
        else:
            outcome = "solved_independently"
        m = re.search(r"(\d+)\s*(?:m\b|min)", low)
        updates.append(
            {
                "title": title,
                "outcome": outcome,
                "minutes": int(m.group(1)) if m else None,
                "used_hint": "hint" in low,
                "viewed_solution": outcome == "viewed_solution",
                "notes": hit.strip()[:140],
            }
        )
    return {
        "updates": updates,
        "coach_note": "[Offline fake coach] Recorded what I could match by title.",
        "unmatched": [],
    }


def research_company(target: dict[str, Any]) -> dict[str, Any]:
    company = target["company"]
    return {
        "notes": (
            f"[Offline fake research — no web search ran for {company} ({target['level']}).]\n"
            "Set ANTHROPIC_API_KEY and refresh to gather real interview reports."
        ),
        "sources": [],
    }


def build_company_intel(context: dict[str, Any]) -> dict[str, Any]:
    valid = context["valid_topics"]
    roadmap_titles = {norm_title(t): t for t in context["roadmap_titles"]}
    recency_boost = {"last 30 days": 1.0, "last 3 months": 0.95, "last 6 months": 0.85}

    problems = []
    topic_score: dict[str, float] = {}
    for r in context["dataset_problems"]:
        topic = _guess_topic(r["title"], r["leetcode_tags"], valid)
        w = round((r["frequency_pct"] / 100) * recency_boost.get(r["most_recent_window"], 0.75), 2)
        topic_score[topic] = topic_score.get(topic, 0) + w
        problems.append(
            {
                "title": roadmap_titles.get(norm_title(r["title"]), r["title"]),
                "kind": "leetcode",
                "topic": topic,
                "difficulty": r["difficulty"] if r["difficulty"] in _MINUTES else "Medium",
                "url": r["url"],
                "description": "",
                "weight": w,
                "evidence": f"Dataset: {r['frequency_pct']:.0f}% frequency, {r['most_recent_window']}.",
                "evidence_urls": [],
                "from_dataset": True,
                "from_web": False,
            }
        )
    top = max(topic_score.values(), default=1.0)
    topic_weights = [
        {"topic": t, "weight": round(0.3 + 0.7 * s / top, 2), "why": "[fake] Share of dataset problems."}
        for t, s in sorted(topic_score.items(), key=lambda kv: -kv[1])
    ]
    # A plausible loop by level: design and behavioral grow with seniority.
    level = context.get("level", "")
    senior = any(k in level for k in ("Senior", "Staff"))
    junior = any(k in level for k in ("Intern", "New grad"))
    rounds = [{"name": "Online assessment", "track": "algorithms", "weight": 0.3, "count": 1,
               "description": "[fake] Timed coding test.", "evidence_urls": []},
              {"name": "Coding interviews", "track": "algorithms", "weight": 0.4 if junior else 0.25, "count": 2,
               "description": "[fake] Live coding.", "evidence_urls": []}]
    if not junior:
        rounds.append({"name": "System design", "track": "system_design", "weight": 0.35 if senior else 0.2,
                       "count": 2 if senior else 1, "description": "[fake] Design a service end to end.", "evidence_urls": []})
    rounds.append({"name": "Behavioral", "track": "behavioral", "weight": 0.15 if senior else 0.1, "count": 1,
                   "description": "[fake] Past projects and values.", "evidence_urls": []})
    design_titles = context.get("design_track_titles", [])
    if not junior:
        for t in design_titles[:3]:
            problems.append({"title": t, "kind": "design", "topic": "Design: Foundations", "difficulty": "Medium",
                             "url": "", "description": "[fake] Common design prompt.", "concepts": [], "weight": 0.5,
                             "evidence": "[fake] Typical for this level.", "evidence_urls": [],
                             "from_dataset": False, "from_web": False})
    return {
        "interview_format": "[Offline fake intel] Built from dataset rows only; no web reports.",
        "rounds": rounds,
        "advice": ["Run a refresh with ANTHROPIC_API_KEY set for real, cited intel."],
        "topic_weights": topic_weights,
        "problems": problems,
    }


def generate_campaign(context: dict[str, Any]) -> dict[str, Any]:
    today = date.fromisoformat(context["today"])
    end = date.fromisoformat(context["interview_date"])
    per_week = max(3, round(context["minutes_per_day"] * 7 / 35))
    intel = context.get("company_intel") or {}
    catalog = context["catalog"]
    status = {p["title"]: p["status"] for p in catalog}
    rounds = intel.get("rounds", [])
    design_share = sum(r["weight"] for r in rounds if r["track"] == "system_design")
    covered = sum(r["weight"] for r in rounds if r["track"] in ("algorithms", "practical", "system_design")) or 1
    design_share /= covered
    design_queue = [p["title"] for p in catalog if p["track"] == "system_design" and p["status"] != "solved"] if design_share else []
    by_norm = {norm_title(t): t for t in status}

    company = [
        by_norm.get(norm_title(p["title"]))
        for p in sorted(intel.get("problems", []), key=lambda p: -p["weight"])
    ]
    company = [t for t in company if t and status[t] != "solved"]
    core = [p["title"] for p in catalog if p["source"] == "roadmap" and p["status"] == "new"]
    company = [t for t in company if t not in design_queue]
    queue: list[str] = []
    for i in range(max(len(company), len(core))):
        for src in (core, company):
            if i < len(src) and src[i] not in queue:
                queue.append(src[i])

    weeks = []
    start = today
    while start <= end:
        stop = min(start + timedelta(days=6 - start.weekday()), end)
        last = stop == end
        if last:
            picks = [{"title": t, "kind": "review"} for t in company[:per_week]]
            theme, goal = "Consolidate", "Review the highest-weight company problems under time."
        else:
            n = max(1, round(per_week * ((stop - start).days + 1) / 7))
            picks = [{"title": queue.pop(0), "kind": "new"} for _ in range(min(n, len(queue)))]
            if design_queue:
                picks.append({"title": design_queue.pop(0), "kind": "new"})
            theme, goal = f"Week {len(weeks) + 1}", "Work through the queued problems."
        budget = context["minutes_per_day"] * ((stop - start).days + 1)
        allocation = [{"track": "algorithms", "minutes": round(budget * (1 - design_share))}]
        if design_share:
            allocation.append({"track": "system_design", "minutes": round(budget * design_share)})
        weeks.append(
            {
                "start": start.isoformat(),
                "end": stop.isoformat(),
                "allocation": allocation,
                "theme": f"[fake] {theme}",
                "goal": goal,
                "focus_topics": [],
                "problems": picks,
            }
        )
        start = stop + timedelta(days=1)
    return {
        "summary": "[Offline fake campaign] Interleaves the core roadmap with company problems, then reviews.",
        "weeks": weeks,
    }


_FAKE_PROBES = [
    ("requirements", "Good start. What scale should we design for: requests per second, data size, read/write ratio?"),
    ("high_level", "Sketch the main components and how a request flows through them."),
    ("deep_dive", "Let's go deeper on storage. How do you partition the data, and what happens when a node fails?"),
    ("deep_dive", "Where would you cache, and how do you keep the cache consistent with writes?"),
    ("wrap_up", "What are the biggest trade-offs in your design, and what would you change at 10x traffic?"),
]


def design_turn(context: dict[str, Any]) -> dict[str, Any]:
    t = context["transcript"]
    if not t:
        return {
            "reply": f"[Offline interviewer] Let's design: {context['problem']['title'].removeprefix('Design ')}. "
                     "Start by telling me the requirements you'd confirm.",
            "phase": "requirements",
            "hint_given": False,
        }
    answers = sum(1 for m in t if m["role"] == "candidate")
    last = t[-1]["text"].lower()
    if any(k in last for k in ("stuck", "not sure", "no idea", "hint")):
        return {"reply": "[Offline interviewer] Hint: think about what's read far more often than it's written.",
                "phase": "high_level", "hint_given": True}
    phase, probe = _FAKE_PROBES[min(answers - 1, len(_FAKE_PROBES) - 1)]
    return {"reply": f"[Offline interviewer] {probe}", "phase": phase, "hint_given": False}


_FAKE_RUBRIC = {
    "Requirements & scope": ("requirement", "scale", "qps", "users", "read", "write"),
    "API & data model": ("api", "schema", "table", "endpoint", "key"),
    "High-level architecture": ("service", "load balancer", "database", "queue", "cache"),
    "Scaling & bottlenecks": ("shard", "partition", "replica", "scale", "bottleneck"),
    "Trade-offs & communication": ("trade-off", "tradeoff", "consistency", "latency", "because"),
}


def design_score(context: dict[str, Any]) -> dict[str, Any]:
    text = " ".join(m["text"].lower() for m in context["transcript"] if m["role"] == "candidate")
    scores = []
    for dim, keys in _FAKE_RUBRIC.items():
        hits = sum(1 for k in keys if k in text)
        scores.append({"dimension": dim, "score": max(1, min(4, 1 + hits)), "note": f"[fake] {hits} related terms mentioned."})
    avg = sum(x["score"] for x in scores) / len(scores)
    hints = context.get("hints_given", 0)
    outcome = "solved_independently" if avg >= 3 and not hints else "solved_with_hints" if avg >= 2.5 else "struggled" if avg >= 1.5 else "gave_up"
    weak = [x["dimension"] for x in scores if x["score"] <= 2]
    return {
        "scores": scores,
        "outcome": outcome,
        "summary": "[Offline grader] Scored by keyword coverage, not judgement. Use the Claude API for real feedback.",
        "strengths": [x["dimension"] for x in scores if x["score"] >= 3],
        "weak_concepts": weak,
    }
