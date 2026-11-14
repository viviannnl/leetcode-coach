"""The Coach: orchestrates roadmap, memory, scheduler, company intel and the LLM.

This is the single place the CLI and the web dashboard talk to. It assembles
the context the model needs, calls it, and writes the results back to disk.

Files under the coach home (``~/.leetcode-coach`` by default):
  state.json              learning history + target (see :mod:`coach.store`)
  last_plan.json          today's plan, so feedback can reference it
  campaign.json           the full week-by-week plan to the interview
  companies/<slug>.json   merged company intel (datasets + web reports)
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from . import companies, llm, review
from .roadmap import PRACTICAL_TOPIC, Roadmap, load_roadmap, norm_title
from .store import Attempt, State, Store, Target


@dataclass
class PlanItem:
    title: str
    kind: str  # "new" | "review"
    difficulty: str
    topic: str
    estimated_minutes: int
    reason: str
    link: str = ""
    source: str = "roadmap"


@dataclass
class Plan:
    focus: str
    coach_note: str
    items: list[PlanItem]
    date: str = ""
    minutes: int = 0

    @property
    def total_minutes(self) -> int:
        return sum(i.estimated_minutes for i in self.items)


Progress = Callable[[str], None]


def _noop(_: str) -> None:
    pass


class Coach:
    def __init__(self, store: Store | None = None, today: date | None = None):
        self.store = store or Store()
        # LEETCODE_COACH_TODAY pins the date (demo fixtures, UI testing).
        pinned = os.environ.get("LEETCODE_COACH_TODAY")
        self.today = today or (date.fromisoformat(pinned) if pinned else date.today())

    @property
    def home(self) -> Path:
        return self.store.path.parent

    # ---- setup ---------------------------------------------------------- #

    def is_initialized(self) -> bool:
        return self.store.load().roadmap_id is not None

    def initialize(self, roadmap_id: str) -> Roadmap:
        """Choose a roadmap and start a fresh (or re-pointed) history."""
        roadmap = load_roadmap(roadmap_id)  # validates it exists
        state = self.store.load()
        state.roadmap_id = roadmap_id
        if not state.created:
            state.created = self.today.isoformat()
        self.store.save(state)
        return roadmap

    def _require_state(self) -> tuple[State, Roadmap]:
        state = self.store.load()
        if state.roadmap_id is None:
            raise RuntimeError("No roadmap selected yet. Run `leetcode-coach init` first.")
        return state, self._effective_roadmap(state)

    def _profile(self, state: State) -> dict[str, Any] | None:
        if not state.target:
            return None
        return companies.load_profile(self.store.path, state.target.company)

    def _effective_roadmap(self, state: State) -> Roadmap:
        """The core roadmap plus the target company's extra problems."""
        base = load_roadmap(state.roadmap_id)
        profile = self._profile(state)
        if not profile:
            return base
        return base.with_extras(profile.get("problems", []))

    # ---- target --------------------------------------------------------- #

    def set_target(
        self,
        company: str,
        interview_date: str | None = None,
        daily_minutes: int | None = None,
    ) -> Target:
        state = self.store.load()
        if state.roadmap_id is None:
            state.roadmap_id = "neetcode-150"
            state.created = state.created or self.today.isoformat()
        if interview_date:
            date.fromisoformat(interview_date)  # validate
        changed_company = not state.target or (
            companies.company_slug(state.target.company) != companies.company_slug(company)
        )
        state.target = Target(company=company.strip(), interview_date=interview_date)
        if daily_minutes:
            state.daily_minutes = int(daily_minutes)
        self.store.save(state)
        if changed_company:
            self._campaign_path().unlink(missing_ok=True)
        return state.target

    def clear_target(self) -> None:
        state = self.store.load()
        state.target = None
        self.store.save(state)
        self._campaign_path().unlink(missing_ok=True)

    def days_left(self, state: State) -> int | None:
        if not state.target or not state.target.interview_date:
            return None
        return (date.fromisoformat(state.target.interview_date) - self.today).days

    # ---- company intel -------------------------------------------------- #

    def refresh_company(self, progress: Progress = _noop) -> dict[str, Any]:
        """Rebuild the target company's profile from datasets + web reports."""
        state = self.store.load()
        if not state.target:
            raise RuntimeError("No target company set. Run `leetcode-coach target <company>`.")
        company = state.target.company
        base = load_roadmap(state.roadmap_id or "neetcode-150")

        progress("Fetching LeetCode company-tag datasets from GitHub…")
        dataset_rows, sources = companies.fetch_datasets(company)

        web: dict[str, Any] | None = None
        web_status = "skipped"
        if llm.supports_web_search():
            progress("Searching the web for recent interview reports…")
            try:
                web = llm.research_company(company)
                web_status = f"ok — {len(web['sources'])} sources"
            except llm.LLMError as exc:
                web_status = f"failed: {exc}"
        else:
            web_status = "unavailable on this provider (needs ANTHROPIC_API_KEY)"

        if not dataset_rows and not web:
            raise RuntimeError(
                f"No data found for {company}: not in the GitHub datasets, and web "
                f"research {web_status}."
            )

        progress("Merging the evidence into a prep profile…")
        context = {
            "company": company,
            "today": self.today.isoformat(),
            "valid_topics": base.topics() + [PRACTICAL_TOPIC],
            "roadmap_titles": [p.title for p in base.problems],
            "dataset_problems": [
                {
                    "title": r["title"],
                    "url": r["url"],
                    "difficulty": r["difficulty"],
                    "frequency_pct": r["frequency"],
                    "most_recent_window": companies.WINDOW_LABELS[r["recency"]],
                    "leetcode_tags": r["tags"],
                }
                for r in dataset_rows
            ],
            "web_report": web["notes"] if web else None,
        }
        intel = llm.build_company_intel(context)

        problems = []
        seen: set[str] = set()
        for p in intel.get("problems", []):
            key = norm_title(p["title"])
            if not key or key in seen:
                continue
            seen.add(key)
            on_roadmap = base.by_title(p["title"])
            if on_roadmap:
                p["title"] = on_roadmap.title
                p["topic"] = on_roadmap.topic
                p["difficulty"] = on_roadmap.difficulty
            p["in_roadmap"] = bool(on_roadmap)
            p["weight"] = max(0.0, min(1.0, float(p.get("weight", 0.5))))
            if not p.get("url") and p["kind"] == "leetcode":
                p["url"] = (on_roadmap.link if on_roadmap else "")
            problems.append(p)
        problems.sort(key=lambda p: -p["weight"])

        topic_weights = [
            {**t, "weight": max(0.0, min(1.0, float(t["weight"])))}
            for t in intel.get("topic_weights", [])
        ]
        topic_weights.sort(key=lambda t: -t["weight"])

        web_sources = [{"kind": "web", **s} for s in (web["sources"] if web else [])]
        profile = {
            "company": company,
            "slug": companies.company_slug(company),
            "updated": datetime.now().isoformat(timespec="seconds"),
            "interview_format": intel.get("interview_format", ""),
            "advice": intel.get("advice", []),
            "topic_weights": topic_weights,
            "problems": problems,
            "sources": sources + web_sources,
            "dataset_count": len(dataset_rows),
            "web_status": web_status,
            "web_report": web["notes"] if web else "",
        }
        companies.save_profile(self.store.path, profile)
        return profile

    # ---- campaign (full plan to the interview) -------------------------- #

    def _campaign_path(self) -> Path:
        return self.home / "campaign.json"

    def load_campaign(self) -> dict[str, Any] | None:
        path = self._campaign_path()
        if not path.exists():
            return None
        return json.loads(path.read_text())

    def generate_campaign(self, progress: Progress = _noop) -> dict[str, Any]:
        state, roadmap = self._require_state()
        if not state.target or not state.target.interview_date:
            raise RuntimeError("Set a target company and interview date first.")
        days = self.days_left(state)
        if days is None or days < 1:
            raise RuntimeError("The interview date must be in the future.")
        profile = self._profile(state)

        progress("Planning every week until the interview…")
        context = {
            "today": self.today.isoformat(),
            "interview_date": state.target.interview_date,
            "days_left": days,
            "minutes_per_day": state.daily_minutes,
            "company": state.target.company,
            "company_intel": _intel_for_prompt(profile),
            "roadmap": [
                {
                    "title": p.title,
                    "topic": p.topic,
                    "difficulty": p.difficulty,
                    "source": p.source,
                    "status": _status(state, p.title),
                }
                for p in roadmap.problems
            ],
        }
        raw = llm.generate_campaign(context)

        weeks = []
        for w in raw.get("weeks", []):
            items = []
            seen: set[str] = set()
            for item in w.get("problems", []):
                prob = roadmap.by_title(item["title"])
                if prob is None or prob.title in seen:
                    continue
                seen.add(prob.title)
                items.append({"title": prob.title, "kind": item.get("kind", "new")})
            weeks.append({**w, "problems": items})

        campaign = {
            "generated": datetime.now().isoformat(timespec="seconds"),
            "generated_for": self.today.isoformat(),
            "company": state.target.company,
            "interview_date": state.target.interview_date,
            "summary": raw.get("summary", ""),
            "weeks": weeks,
        }
        path = self._campaign_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(campaign, indent=2))
        return campaign

    def _current_week(self, campaign: dict[str, Any] | None) -> dict[str, Any] | None:
        if not campaign:
            return None
        t = self.today.isoformat()
        for w in campaign.get("weeks", []):
            if w["start"] <= t <= w["end"]:
                return w
        return None

    # ---- daily planning ------------------------------------------------- #

    def plan_today(self, minutes: int) -> Plan:
        state, roadmap = self._require_state()
        context = self._build_plan_context(state, roadmap, minutes)
        raw = llm.generate_plan(context)
        plan = self._materialize_plan(raw, roadmap)
        plan.date = self.today.isoformat()
        plan.minutes = minutes
        self.save_plan(plan)
        return plan

    def _build_plan_context(self, state: State, roadmap: Roadmap, minutes: int) -> dict[str, Any]:
        history = []
        for p in roadmap.problems:
            rec = state.records.get(p.title)
            if rec is None:
                continue
            last = rec.last_attempt
            history.append(
                {
                    "title": p.title,
                    "topic": p.topic,
                    "attempts": len(rec.attempts),
                    "solved": rec.solved,
                    "last_outcome": last.outcome if last else None,
                    "last_date": last.date if last else None,
                    "last_notes": last.notes if last else "",
                    "next_review": rec.next_review,
                    "due_for_review": review.is_due(rec, self.today),
                }
            )

        roadmap_view = [
            {
                "title": p.title,
                "topic": p.topic,
                "difficulty": p.difficulty,
                "order": p.order,
                "source": p.source,
                "status": _status(state, p.title),
            }
            for p in roadmap.problems
        ]

        context: dict[str, Any] = {
            "today": self.today.isoformat(),
            "available_minutes": minutes,
            "roadmap": {
                "name": roadmap.name,
                "description": roadmap.description,
                "problems": roadmap_view,
            },
            "history": history,
        }
        if state.target:
            context["target"] = {
                "company": state.target.company,
                "interview_date": state.target.interview_date,
                "days_left": self.days_left(state),
            }
            context["company_intel"] = _intel_for_prompt(self._profile(state))
            week = self._current_week(self.load_campaign())
            if week:
                context["this_week"] = week
        return context

    def _materialize_plan(self, raw: dict[str, Any], roadmap: Roadmap) -> Plan:
        items: list[PlanItem] = []
        for entry in raw.get("items", []):
            prob = roadmap.by_title(entry["title"])
            if prob is None:
                continue  # model referenced something not in the roadmap
            items.append(
                PlanItem(
                    title=prob.title,
                    kind=entry.get("kind", "new"),
                    difficulty=prob.difficulty,
                    topic=prob.topic,
                    estimated_minutes=int(entry.get("estimated_minutes", 0)),
                    reason=entry.get("reason", ""),
                    link=prob.link,
                    source=prob.source,
                )
            )
        return Plan(
            focus=raw.get("focus", "balanced"),
            coach_note=raw.get("coach_note", ""),
            items=items,
        )

    def _plan_path(self) -> Path:
        return self.home / "last_plan.json"

    def save_plan(self, plan: Plan) -> None:
        payload = {
            "date": plan.date,
            "minutes": plan.minutes,
            "focus": plan.focus,
            "coach_note": plan.coach_note,
            "items": [asdict(i) for i in plan.items],
        }
        path = self._plan_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2))

    def load_plan(self) -> Plan | None:
        path = self._plan_path()
        if not path.exists():
            return None
        raw = json.loads(path.read_text())
        fields = PlanItem.__dataclass_fields__
        items = [PlanItem(**{k: v for k, v in i.items() if k in fields}) for i in raw.get("items", [])]
        return Plan(
            focus=raw.get("focus", "balanced"),
            coach_note=raw.get("coach_note", ""),
            items=items,
            date=raw.get("date", ""),
            minutes=raw.get("minutes", 0),
        )

    # ---- daily feedback ------------------------------------------------- #

    def record_feedback(self, feedback: str, plan: Plan | None = None) -> dict[str, Any]:
        """Parse the user's recap, update history + schedule, and persist.

        Returns ``{"applied": [...], "unmatched": [...], "coach_note": str}``.
        """
        state, roadmap = self._require_state()
        if plan is None:
            plan = self.load_plan()

        reference = {
            "todays_plan": [{"title": i.title, "kind": i.kind} for i in plan.items] if plan else [],
            "roadmap_titles": [p.title for p in roadmap.problems],
        }
        raw = llm.parse_feedback({"reference": reference, "feedback": feedback})

        applied: list[dict[str, Any]] = []
        unmatched = list(raw.get("unmatched", []))
        for update in raw.get("updates", []):
            prob = roadmap.by_title(update["title"])
            if prob is None:
                unmatched.append(update["title"])
                continue
            attempt = Attempt(
                date=self.today.isoformat(),
                minutes=update.get("minutes"),
                outcome=update.get("outcome", "solved_independently"),
                used_hint=bool(update.get("used_hint", False)),
                viewed_solution=bool(update.get("viewed_solution", False)),
                notes=update.get("notes", ""),
            )
            record = state.record_for(prob.title, prob.topic)
            review.apply_attempt(record, attempt, self.today)
            applied.append(
                {"title": prob.title, "outcome": attempt.outcome, "next_review": record.next_review}
            )

        self.store.save(state)
        return {"applied": applied, "unmatched": unmatched, "coach_note": raw.get("coach_note", "")}

    # ---- progress + dashboard ------------------------------------------- #

    def _topic_progress(self, state: State, roadmap: Roadmap) -> dict[str, float]:
        out: dict[str, float] = {}
        for topic in roadmap.topics():
            probs = [p for p in roadmap.problems if p.topic == topic]
            if probs:
                out[topic] = sum(
                    companies.problem_mastery(state, p.title, self.today) for p in probs
                ) / len(probs)
        return out

    def progress(self) -> dict[str, Any]:
        state, roadmap = self._require_state()
        total = len(roadmap.problems)
        solved = sum(1 for p in roadmap.problems if (r := state.records.get(p.title)) and r.solved)
        attempted = sum(1 for p in roadmap.problems if p.title in state.records)
        due = sum(
            1 for p in roadmap.problems
            if (r := state.records.get(p.title)) and review.is_due(r, self.today)
        )
        by_topic = []
        for topic in roadmap.topics():
            probs = [p for p in roadmap.problems if p.topic == topic]
            t_solved = sum(1 for p in probs if (r := state.records.get(p.title)) and r.solved)
            by_topic.append({"topic": topic, "solved": t_solved, "total": len(probs)})
        out = {
            "roadmap": roadmap.name,
            "solved": solved,
            "attempted": attempted,
            "total": total,
            "due_reviews": due,
            "by_topic": by_topic,
        }
        profile = self._profile(state)
        if state.target and profile:
            r = companies.readiness(state, profile, self._topic_progress(state, roadmap), self.today)
            out["target"] = {
                "company": state.target.company,
                "interview_date": state.target.interview_date,
                "days_left": self.days_left(state),
                "readiness": r["overall"],
                "weak_spots": r["weak_spots"],
            }
        return out

    def dashboard(self) -> dict[str, Any]:
        """Everything the web dashboard renders, in one payload."""
        state = self.store.load()
        initialized = state.roadmap_id is not None
        base: dict[str, Any] = {
            "today": self.today.isoformat(),
            "initialized": initialized,
            "provider": {"name": llm.provider(), "web_search": llm.supports_web_search()},
            "demo": os.environ.get("LEETCODE_COACH_DEMO") or None,
            "daily_minutes": state.daily_minutes,
            "target": None,
        }
        if not initialized:
            return base
        roadmap = self._effective_roadmap(state)
        profile = self._profile(state)
        campaign = self.load_campaign()

        def pinfo(title: str) -> dict[str, Any]:
            p = roadmap.by_title(title)
            rec = state.records.get(p.title) if p else None
            return {
                "title": p.title if p else title,
                "topic": p.topic if p else "",
                "difficulty": p.difficulty if p else "",
                "source": p.source if p else "",
                "link": p.link if p else "",
                "status": _status(state, p.title) if p else "new",
                "due": bool(rec and review.is_due(rec, self.today)),
                "next_review": rec.next_review if rec else None,
                "mastery": companies.problem_mastery(state, p.title, self.today) if p else 0,
            }

        if state.target:
            base["target"] = {
                "company": state.target.company,
                "interview_date": state.target.interview_date,
                "days_left": self.days_left(state),
            }

        topic_progress = self._topic_progress(state, roadmap)

        if profile:
            r = companies.readiness(state, profile, topic_progress, self.today)
            mastery = {x["title"]: x["mastery"] for x in r["problems"]}
            base["readiness"] = {k: r[k] for k in ("overall", "problem_coverage", "topic_strength", "weak_spots")}
            base["company"] = {
                "updated": profile.get("updated"),
                "interview_format": profile.get("interview_format", ""),
                "advice": profile.get("advice", []),
                "topic_weights": [
                    {**t, "progress": round(topic_progress.get(t["topic"], 0.0), 3)}
                    for t in profile.get("topic_weights", [])
                ],
                "problems": [
                    {**p, **pinfo(p["title"]), "mastery": mastery.get(p["title"], 0)}
                    for p in profile.get("problems", [])
                ],
                "sources": profile.get("sources", []),
                "dataset_count": profile.get("dataset_count", 0),
                "web_status": profile.get("web_status", ""),
            }

        if campaign:
            t = self.today.isoformat()
            weeks = []
            for i, w in enumerate(campaign.get("weeks", []), 1):
                probs = [{**pinfo(x["title"]), "kind": x["kind"]} for x in w.get("problems", [])]
                done = sum(1 for p in probs if p["status"] == "solved")
                weeks.append(
                    {
                        **w,
                        "index": i,
                        "problems": probs,
                        "done": done,
                        "current": w["start"] <= t <= w["end"],
                        "past": w["end"] < t,
                    }
                )
            base["campaign"] = {
                "summary": campaign.get("summary", ""),
                "generated": campaign.get("generated"),
                "stale": campaign.get("interview_date") != (state.target.interview_date if state.target else None),
                "weeks": weeks,
            }

        plan = self.load_plan()
        if plan and plan.date == self.today.isoformat():
            base["today_plan"] = {
                "focus": plan.focus,
                "coach_note": plan.coach_note,
                "minutes": plan.minutes,
                "total_minutes": plan.total_minutes,
                "items": [{**asdict(i), **{k: v for k, v in pinfo(i.title).items() if k in ("status", "link")}} for i in plan.items],
            }

        due = [
            pinfo(p.title) for p in roadmap.problems
            if (rec := state.records.get(p.title)) and review.is_due(rec, self.today)
        ]
        base["due_reviews"] = due

        topics = []
        for topic in roadmap.topics():
            probs = [p for p in roadmap.problems if p.topic == topic]
            solved = sum(1 for p in probs if (rec := state.records.get(p.title)) and rec.solved)
            topics.append(
                {
                    "topic": topic,
                    "solved": solved,
                    "total": len(probs),
                    "mastery": round(topic_progress.get(topic, 0.0), 3),
                }
            )
        base["topics"] = topics
        base["totals"] = {
            "solved": sum(t["solved"] for t in topics),
            "total": sum(t["total"] for t in topics),
            "attempted": len(state.records),
        }

        activity = []
        for title, rec in state.records.items():
            for a in rec.attempts:
                activity.append({"title": title, "topic": rec.topic, **asdict(a)})
        activity.sort(key=lambda a: a["date"], reverse=True)
        base["activity"] = activity[:12]
        base["streak"] = _streak({a["date"] for a in activity}, self.today)
        return base


def _intel_for_prompt(profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if not profile:
        return None
    return {
        "interview_format": profile.get("interview_format", ""),
        "topic_weights": [
            {"topic": t["topic"], "weight": t["weight"]} for t in profile.get("topic_weights", [])
        ],
        "problems": [
            {
                "title": p["title"],
                "kind": p.get("kind"),
                "topic": p.get("topic"),
                "weight": p.get("weight"),
                "description": p.get("description", ""),
            }
            for p in profile.get("problems", [])
        ],
    }


def _streak(days: set[str], today: date) -> int:
    """Consecutive practice days ending today (or yesterday)."""
    d = today if today.isoformat() in days else today - timedelta(days=1)
    n = 0
    while d.isoformat() in days:
        n += 1
        d -= timedelta(days=1)
    return n


def _status(state: State, title: str) -> str:
    rec = state.records.get(title)
    if rec is None:
        return "new"
    if rec.solved:
        return "solved"
    return "in_progress"
