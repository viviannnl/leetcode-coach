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


def research_company(company: str) -> dict[str, Any]:
    return {
        "notes": (
            f"[Offline fake research — no web search ran for {company}.]\n"
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
    return {
        "interview_format": "[Offline fake intel] Built from dataset rows only; no web reports.",
        "advice": ["Run a refresh with ANTHROPIC_API_KEY set for real, cited intel."],
        "topic_weights": topic_weights,
        "problems": problems,
    }


def generate_campaign(context: dict[str, Any]) -> dict[str, Any]:
    today = date.fromisoformat(context["today"])
    end = date.fromisoformat(context["interview_date"])
    per_week = max(3, round(context["minutes_per_day"] * 7 / 35))
    intel = context.get("company_intel") or {}
    status = {p["title"]: p["status"] for p in context["roadmap"]}
    by_norm = {norm_title(t): t for t in status}

    company = [
        by_norm.get(norm_title(p["title"]))
        for p in sorted(intel.get("problems", []), key=lambda p: -p["weight"])
    ]
    company = [t for t in company if t and status[t] != "solved"]
    core = [p["title"] for p in context["roadmap"] if p["source"] == "roadmap" and p["status"] == "new"]
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
            theme, goal = f"Week {len(weeks) + 1}", "Work through the queued problems."
        weeks.append(
            {
                "start": start.isoformat(),
                "end": stop.isoformat(),
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
