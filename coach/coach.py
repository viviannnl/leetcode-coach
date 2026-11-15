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
import uuid
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from . import companies, leetcode, llm, review
from .i18n import LANGUAGES, tr
from .roadmap import PRACTICAL_TOPIC, SYSTEM_DESIGN, TRACKS, Roadmap, load_roadmap, norm_title
from .store import DEFAULT_LEVEL, LEVELS, Attempt, State, Store, Target


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
    track: str = "algorithms"


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

    # ---- settings -------------------------------------------------------- #

    @property
    def lang(self) -> str:
        return self.store.load().language

    def set_language(self, language: str) -> str:
        if language not in LANGUAGES:
            raise ValueError(tr(self.lang, "err_language"))
        state = self.store.load()
        state.language = language
        self.store.save(state)
        return language

    def _msg(self, key: str, **kw: object) -> str:
        return tr(self.lang, key, **kw)

    # ---- target --------------------------------------------------------- #

    def set_target(
        self,
        company: str,
        interview_date: str | None = None,
        daily_minutes: int | None = None,
        level: str | None = None,
        role: str | None = None,
        job_posting: str | None = None,
    ) -> Target:
        state = self.store.load()
        if state.roadmap_id is None:
            state.roadmap_id = "neetcode-150"
            state.created = state.created or self.today.isoformat()
        if interview_date:
            date.fromisoformat(interview_date)  # validate
        prev = state.target
        level = level or (prev.level if prev else DEFAULT_LEVEL)
        if level not in LEVELS:
            raise ValueError(f"Unknown level {level!r}. Choose from: {', '.join(LEVELS)}")
        changed_company = not prev or (
            companies.company_slug(prev.company) != companies.company_slug(company)
        )
        state.target = Target(
            company=company.strip(),
            interview_date=interview_date,
            level=level,
            role=(role or (prev.role if prev else "") or "Software Engineer").strip(),
            job_posting=(job_posting if job_posting is not None else (prev.job_posting if prev and not changed_company else "")).strip(),
        )
        if daily_minutes:
            state.daily_minutes = int(daily_minutes)
        self.store.save(state)
        # A different company or level means a different loop: the old plan no longer fits.
        if changed_company or (prev and prev.level != level):
            self._campaign_path().unlink(missing_ok=True)
        return state.target

    def needs_research(self, state: State | None = None) -> bool:
        """True when there's no intel yet, or it was gathered for another level."""
        state = state or self.store.load()
        profile = self._profile(state)
        return bool(state.target) and (not profile or profile.get("level", DEFAULT_LEVEL) != state.target.level)

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
        target = state.target
        company = target.company
        base = load_roadmap(state.roadmap_id or "neetcode-150")

        progress(self._msg("datasets"))
        dataset_rows, sources = companies.fetch_datasets(company)

        web: dict[str, Any] | None = None
        web_status = "skipped"
        if llm.supports_web_search():
            progress(self._msg("web"))
            try:
                web = llm.research_company(
                    {
                        "company": company,
                        "level": target.level_label,
                        "role": target.role,
                        "job_posting": target.job_posting,
                    }
                )
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

        progress(self._msg("merge"))
        context = {
            "language": state.language,
            "company": company,
            "level": target.level_label,
            "role": target.role,
            "today": self.today.isoformat(),
            "valid_topics": base.topics() + [PRACTICAL_TOPIC],
            "roadmap_titles": [p.title for p in base.problems if p.track != SYSTEM_DESIGN],
            "design_track_titles": [p.title for p in base.in_track(SYSTEM_DESIGN)],
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
            "job_posting": target.job_posting or None,
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
                if on_roadmap.track == SYSTEM_DESIGN:
                    p["kind"] = "design"
                    p["concepts"] = p.get("concepts") or list(on_roadmap.concepts)
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

        rounds = _normalise_rounds(intel.get("rounds", []))

        web_sources = [{"kind": "web", **s} for s in (web["sources"] if web else [])]
        profile = {
            "company": company,
            "slug": companies.company_slug(company),
            "updated": datetime.now().isoformat(timespec="seconds"),
            "level": target.level,
            "role": target.role,
            "interview_format": intel.get("interview_format", ""),
            "rounds": rounds,
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

        progress(self._msg("campaign"))
        context = {
            "language": state.language,
            "today": self.today.isoformat(),
            "interview_date": state.target.interview_date,
            "days_left": days,
            "minutes_per_day": state.daily_minutes,
            "company": state.target.company,
            "level": state.target.level_label,
            "company_intel": _intel_for_prompt(profile),
            "leetcode_profile": _profile_for_prompt(state.leetcode) if state.leetcode and state.leetcode.get("solved") else None,
            "catalog": [
                {
                    "title": p.title,
                    "track": p.track,
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
            allocation = [
                {"track": a["track"], "minutes": max(0, int(a.get("minutes", 0)))}
                for a in w.get("allocation", [])
                if a.get("track") in TRACKS and int(a.get("minutes", 0)) > 0
            ]
            weeks.append({**w, "problems": items, "allocation": allocation})

        campaign = {
            "generated": datetime.now().isoformat(timespec="seconds"),
            "generated_for": self.today.isoformat(),
            "company": state.target.company,
            "interview_date": state.target.interview_date,
            "level": state.target.level,
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

    # ---- LeetCode sync -------------------------------------------------- #

    SYNC_COOLDOWN_S = 600  # recent-solve list changes slowly; don't hit LeetCode on every plan

    def link_leetcode(self, username: str, progress: Progress = _noop) -> dict[str, Any]:
        """Link a public LeetCode profile and run a first sync."""
        username = username.strip().lstrip("@")
        if not leetcode.valid_username(username):
            raise ValueError("That doesn't look like a LeetCode username (letters, digits, - and _).")
        state = self.store.load()
        if state.roadmap_id is None:
            raise RuntimeError("Set up the coach first.")
        state.leetcode = {"username": username, "last_seen_ts": 0}
        self.store.save(state)
        return self.sync_leetcode(progress)

    def unlink_leetcode(self) -> None:
        state = self.store.load()
        state.leetcode = None
        self.store.save(state)

    def sync_leetcode(self, progress: Progress = _noop) -> dict[str, Any]:
        """Pull the public profile and log new accepted submissions.

        A recent accepted submission becomes an attempt (outcome solved, marked
        source "leetcode") when it's on the roadmap and not already logged that
        day. LeetCode can't say whether hints were used — a later recap of the
        same problem that day replaces the synced attempt.
        """
        state, roadmap = self._require_state()
        link = state.leetcode
        if not link:
            raise RuntimeError("No LeetCode account linked.")
        progress(self._msg("lc_read", username=link["username"]))
        profile = leetcode.fetch_profile(link["username"])

        added: list[str] = []
        other: list[str] = []
        last_seen = int(link.get("last_seen_ts", 0))
        for sub in profile["recent"]:
            if sub["timestamp"] <= last_seen:
                continue
            prob = roadmap.by_title(sub["title"]) or roadmap.by_title(sub["slug"].replace("-", " "))
            if prob is None:
                other.append(sub["title"])
                continue
            rec = state.record_for(prob.title, prob.topic)
            if any(a.date == sub["date"] for a in rec.attempts):
                continue  # already logged that day (a recap or an earlier sync)
            attempt = Attempt(
                date=sub["date"], outcome="solved_independently",
                notes="Accepted on LeetCode (synced).", source="leetcode",
            )
            rec.attempts.append(attempt)
            rec.attempts.sort(key=lambda a: a.date)
            review.rebuild(rec)
            added.append(prob.title)

        state.leetcode = {
            **link,
            "username": profile["username"],
            "synced_at": datetime.now().isoformat(timespec="seconds"),
            "last_seen_ts": max([last_seen] + [s["timestamp"] for s in profile["recent"]]),
            "solved": profile["solved"],
            "tags": profile["tags"][:40],
            "last_added": added,
            "last_other": other[:10],
        }
        self.store.save(state)
        return {"username": profile["username"], "added": added, "other": other, "solved": profile["solved"]}

    def _maybe_sync(self) -> None:
        """Best-effort sync before planning; never blocks planning on LeetCode."""
        link = self.store.load().leetcode
        if not link:
            return
        last = link.get("synced_at")
        if last and (datetime.now() - datetime.fromisoformat(last)).total_seconds() < self.SYNC_COOLDOWN_S:
            return
        try:
            self.sync_leetcode()
        except (leetcode.LeetCodeError, RuntimeError):
            pass

    # ---- daily planning ------------------------------------------------- #

    def plan_today(self, minutes: int) -> Plan:
        self._maybe_sync()
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
                    "track": p.track,
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
                "track": p.track,
                "topic": p.topic,
                "difficulty": p.difficulty,
                "order": p.order,
                "source": p.source,
                "status": _status(state, p.title),
            }
            for p in roadmap.problems
        ]

        context: dict[str, Any] = {
            "language": state.language,
            "today": self.today.isoformat(),
            "available_minutes": minutes,
            "roadmap": {
                "name": roadmap.name,
                "description": roadmap.description,
                "problems": roadmap_view,
            },
            "history": history,
        }
        if state.leetcode and state.leetcode.get("solved"):
            context["leetcode_profile"] = _profile_for_prompt(state.leetcode)
        if state.target:
            context["target"] = {
                "company": state.target.company,
                "level": state.target.level_label,
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
                    track=prob.track,
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
        raw = llm.parse_feedback({"reference": reference, "feedback": feedback, "language": state.language})

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
            synced = [a for a in record.attempts if a.source == "leetcode" and a.date == attempt.date]
            if synced:
                # The recap knows more than the sync (hints, struggle): it replaces it.
                record.attempts = [a for a in record.attempts if a not in synced] + [attempt]
                record.attempts.sort(key=lambda a: a.date)
                review.rebuild(record)
            else:
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
            r = companies.readiness(state, profile, roadmap, self.today)
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
            "language": state.language,
            "daily_minutes": state.daily_minutes,
            "target": None,
            "levels": [{"id": k, "label": v} for k, v in LEVELS.items()],
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
                "track": p.track if p else "algorithms",
                "concepts": list(p.concepts) if p else [],
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
                "level": state.target.level,
                "level_label": state.target.level_label,
                "role": state.target.role,
                "has_job_posting": bool(state.target.job_posting),
            }
            base["needs_research"] = self.needs_research(state)

        topic_progress = self._topic_progress(state, roadmap)

        if profile:
            r = companies.readiness(state, profile, roadmap, self.today)
            mastery = {x["title"]: x["mastery"] for x in r["problems"]}
            base["readiness"] = {
                k: r[k] for k in ("overall", "rounds", "untracked_weight", "tracks", "problem_coverage", "topic_strength", "weak_spots")
            }
            base["company"] = {
                "updated": profile.get("updated"),
                "level": profile.get("level", DEFAULT_LEVEL),
                "stale_level": profile.get("level", DEFAULT_LEVEL) != (state.target.level if state.target else DEFAULT_LEVEL),
                "rounds": r["rounds"],
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
                "has_allocation": any(w.get("allocation") for w in campaign.get("weeks", [])),
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
                    "track": probs[0].track,
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
            prob = roadmap.by_title(title)
            for a in rec.attempts:
                activity.append({"title": title, "topic": rec.topic, "track": prob.track if prob else "algorithms", **asdict(a)})
        activity.sort(key=lambda a: a["date"], reverse=True)
        base["activity"] = activity[:12]
        base["streak"] = _streak({a["date"] for a in activity}, self.today)
        lc = state.leetcode
        base["leetcode"] = (
            {
                "username": lc.get("username"),
                "synced_at": lc.get("synced_at"),
                "solved": lc.get("solved"),
                "tags": (lc.get("tags") or [])[:8],
                "last_added": lc.get("last_added", []),
                "last_other": lc.get("last_other", []),
            }
            if lc else None
        )
        active = self.active_design_session()
        base["design_session"] = active
        base["design_scorecards"] = self.recent_scorecards(limit=5)
        return base

    # ---- system design sessions ---------------------------------------- #
    # A session is a mock interview: Claude plays interviewer, the user types
    # their design, and finishing it grades the transcript against a rubric and
    # records an attempt (so design problems join spaced repetition like any
    # other). Sessions are plain JSON under design_sessions/.

    def _sessions_dir(self) -> Path:
        return self.home / "design_sessions"

    def _session_path(self, session_id: str) -> Path:
        if not session_id.isalnum():
            raise ValueError("Bad session id.")
        return self._sessions_dir() / f"{session_id}.json"

    def load_design_session(self, session_id: str) -> dict[str, Any]:
        path = self._session_path(session_id)
        if not path.exists():
            raise RuntimeError("That design session doesn't exist.")
        return json.loads(path.read_text())

    def _save_session(self, session: dict[str, Any]) -> None:
        path = self._session_path(session["id"])
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(session, indent=2))
        tmp.replace(path)

    def _all_sessions(self) -> list[dict[str, Any]]:
        d = self._sessions_dir()
        if not d.exists():
            return []
        out = [json.loads(p.read_text()) for p in d.glob("*.json")]
        return sorted(out, key=lambda x: x.get("started", ""), reverse=True)

    def active_design_session(self) -> dict[str, Any] | None:
        for sess in self._all_sessions():
            if sess.get("status") == "active":
                return sess
        return None

    def recent_scorecards(self, limit: int = 5) -> list[dict[str, Any]]:
        done = [x for x in self._all_sessions() if x.get("status") == "finished"]
        return [
            {"id": x["id"], "title": x["title"], "finished": x.get("finished"), "minutes": x.get("minutes"), "scorecard": x.get("scorecard")}
            for x in done[:limit]
        ]

    def _session_context(self, state: State, session: dict[str, Any]) -> dict[str, Any]:
        target = state.target
        return {
            "problem": {"title": session["title"], "concepts": session.get("concepts", []), "difficulty": session.get("difficulty")},
            "company": target.company if target else None,
            "level": target.level_label if target else LEVELS[DEFAULT_LEVEL],
            "transcript": session["transcript"],
        }

    def start_design_session(self, title: str, progress: Progress = _noop) -> dict[str, Any]:
        state, roadmap = self._require_state()
        prob = roadmap.by_title(title)
        if prob is None or prob.track != SYSTEM_DESIGN:
            raise RuntimeError(f"{title!r} isn't a system design problem.")
        active = self.active_design_session()
        if active and active["title"] == prob.title:
            return active  # resume rather than start a duplicate
        if active:
            raise RuntimeError(f"Finish or abandon your session on {active['title']!r} first.")
        session = {
            "id": uuid.uuid4().hex[:12],
            "title": prob.title,
            "topic": prob.topic,
            "difficulty": prob.difficulty,
            "concepts": list(prob.concepts),
            "status": "active",
            "started": datetime.now().isoformat(timespec="seconds"),
            "date": self.today.isoformat(),
            "hints": 0,
            "transcript": [],
        }
        progress(self._msg("design_start"))
        turn = llm.design_turn(self._session_context(state, session))
        session["transcript"].append({"role": "interviewer", "text": turn["reply"], "phase": turn["phase"]})
        self._save_session(session)
        return session

    def reply_design_session(self, session_id: str, text: str, progress: Progress = _noop) -> dict[str, Any]:
        state = self.store.load()
        session = self.load_design_session(session_id)
        if session["status"] != "active":
            raise RuntimeError("This session is already finished.")
        session["transcript"].append({"role": "candidate", "text": text})
        progress(self._msg("design_turn"))
        turn = llm.design_turn(self._session_context(state, session))
        session["transcript"].append({"role": "interviewer", "text": turn["reply"], "phase": turn["phase"]})
        if turn.get("hint_given"):
            session["hints"] = session.get("hints", 0) + 1
        self._save_session(session)
        return session

    def abandon_design_session(self, session_id: str) -> None:
        session = self.load_design_session(session_id)
        session["status"] = "abandoned"
        self._save_session(session)

    def finish_design_session(self, session_id: str, progress: Progress = _noop) -> dict[str, Any]:
        state, roadmap = self._require_state()
        session = self.load_design_session(session_id)
        if session["status"] != "active":
            raise RuntimeError("This session is already finished.")
        if not any(m["role"] == "candidate" for m in session["transcript"]):
            raise RuntimeError("Write at least one answer before finishing.")
        progress(self._msg("design_grade"))
        ctx = self._session_context(state, session)
        ctx["hints_given"] = session.get("hints", 0)
        ctx["language"] = state.language  # feedback language; the interview itself stays English
        card = llm.design_score(ctx)

        started = datetime.fromisoformat(session["started"])
        minutes = max(1, round((datetime.now() - started).total_seconds() / 60))
        prob = roadmap.by_title(session["title"])
        weak = ", ".join(card.get("weak_concepts", [])[:4])
        attempt = Attempt(
            date=self.today.isoformat(),
            minutes=minutes,
            outcome=card["outcome"],
            used_hint=session.get("hints", 0) > 0,
            viewed_solution=False,
            notes=(card.get("summary", "") + (f" Revisit: {weak}." if weak else ""))[:400],
        )
        record = state.record_for(prob.title, prob.topic)
        review.apply_attempt(record, attempt, self.today)
        self.store.save(state)

        session.update(
            status="finished",
            finished=datetime.now().isoformat(timespec="seconds"),
            minutes=minutes,
            scorecard={**card, "next_review": record.next_review},
        )
        self._save_session(session)
        return session


def _normalise_rounds(rounds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Clamp weights and rescale them to sum to 1 (models don't add up exactly)."""
    out = []
    for r in rounds:
        w = max(0.0, float(r.get("weight", 0.0)))
        out.append({**r, "weight": w, "count": max(1, int(r.get("count", 1) or 1))})
    total = sum(r["weight"] for r in out)
    for r in out:
        r["weight"] = round(r["weight"] / total, 3) if total else round(1 / len(out), 3)
    return out


def _intel_for_prompt(profile: dict[str, Any] | None) -> dict[str, Any] | None:
    if not profile:
        return None
    return {
        "interview_format": profile.get("interview_format", ""),
        "rounds": [
            {"name": r["name"], "track": r["track"], "weight": r["weight"], "count": r.get("count", 1)}
            for r in profile.get("rounds", [])
        ],
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


def _profile_for_prompt(lc: dict[str, Any]) -> dict[str, Any]:
    """What the planner needs to calibrate: overall solved counts and topic tags."""
    return {
        "note": "Lifetime LeetCode stats from the user's public profile; use to judge current skill, not as recent practice.",
        "solved": lc.get("solved"),
        "tags": (lc.get("tags") or [])[:25],
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
