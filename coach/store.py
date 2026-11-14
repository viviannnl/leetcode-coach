"""Persistent learning history ("Memory").

The user never edits this by hand. The AI updates it from natural-language
feedback after each session. It is plain JSON so future features (dashboards,
knowledge graphs, analytics) can build on it without a redesign.

State lives at ``~/.leetcode-coach/state.json`` by default. Every problem the
user has interacted with gets a record; problems never touched simply have no
record yet (they are "new").
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import date
from pathlib import Path
from typing import Any


def default_state_path() -> Path:
    override = os.environ.get("LEETCODE_COACH_HOME")
    base = Path(override) if override else Path.home() / ".leetcode-coach"
    return base / "state.json"


@dataclass
class Attempt:
    """One recorded practice session on a problem."""

    date: str  # ISO date, e.g. "2026-07-12"
    minutes: int | None = None
    # How it went, as classified by the AI from the user's words.
    # One of: "solved_independently", "solved_with_hints", "viewed_solution",
    # "gave_up", "reviewed_easily", "struggled".
    outcome: str = "solved_independently"
    used_hint: bool = False
    viewed_solution: bool = False
    notes: str = ""
    # Where the attempt came from: "" for recaps/sessions, "leetcode" for sync.
    source: str = ""


@dataclass
class ProblemRecord:
    """Everything the coach remembers about one problem."""

    title: str
    topic: str
    attempts: list[Attempt] = field(default_factory=list)
    # When this problem should next surface for review (ISO date), or None if
    # no review is currently scheduled.
    next_review: str | None = None
    # Spaced-repetition interval in days used to compute the last next_review.
    interval_days: int = 0
    # Rolling count of successful reviews (drives interval growth).
    review_streak: int = 0

    @property
    def first_seen(self) -> str | None:
        return self.attempts[0].date if self.attempts else None

    @property
    def last_attempt(self) -> Attempt | None:
        return self.attempts[-1] if self.attempts else None

    @property
    def solved(self) -> bool:
        """Has the user ever gotten this problem out (with or without help)?"""
        return any(
            a.outcome
            in ("solved_independently", "solved_with_hints", "reviewed_easily")
            for a in self.attempts
        )


LEVELS = {
    "intern": "Intern",
    "new_grad": "New grad",
    "mid": "Mid-level",
    "senior": "Senior",
    "staff": "Staff+",
}
DEFAULT_LEVEL = "mid"


@dataclass
class Target:
    """The interview the user is preparing for."""

    company: str  # display name, e.g. "Anthropic"
    interview_date: str | None = None  # ISO date, e.g. "2026-12-25"
    level: str = DEFAULT_LEVEL  # key of LEVELS
    role: str = "Software Engineer"
    # Optional pasted job posting; sharpens research (level, team, focus).
    job_posting: str = ""

    @property
    def level_label(self) -> str:
        return LEVELS.get(self.level, self.level)


@dataclass
class State:
    roadmap_id: str | None = None
    created: str = ""
    records: dict[str, ProblemRecord] = field(default_factory=dict)
    target: Target | None = None
    # Typical minutes per day, used to size the multi-week plan.
    daily_minutes: int = 60
    # Linked public LeetCode profile: {username, synced_at, last_seen_ts,
    # solved, tags, last_added, last_other}. None when not linked.
    leetcode: dict[str, Any] | None = None

    def record_for(self, title: str, topic: str) -> ProblemRecord:
        rec = self.records.get(title)
        if rec is None:
            rec = ProblemRecord(title=title, topic=topic)
            self.records[title] = rec
        return rec


class Store:
    """Loads and saves :class:`State` as JSON."""

    def __init__(self, path: Path | None = None):
        self.path = path or default_state_path()

    def exists(self) -> bool:
        return self.path.exists()

    def load(self) -> State:
        if not self.path.exists():
            return State()
        raw = json.loads(self.path.read_text())
        records = {
            title: _record_from_dict(rec) for title, rec in raw.get("records", {}).items()
        }
        return State(
            roadmap_id=raw.get("roadmap_id"),
            created=raw.get("created", ""),
            records=records,
            target=_target_from_dict(raw["target"]) if raw.get("target") else None,
            daily_minutes=raw.get("daily_minutes", 60),
            leetcode=raw.get("leetcode"),
        )

    def save(self, state: State) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload: dict[str, Any] = {
            "roadmap_id": state.roadmap_id,
            "created": state.created or date.today().isoformat(),
            "records": {title: asdict(rec) for title, rec in state.records.items()},
            "target": asdict(state.target) if state.target else None,
            "daily_minutes": state.daily_minutes,
            "leetcode": state.leetcode,
        }
        # Write atomically so a crash mid-write can't corrupt history.
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2, sort_keys=True))
        tmp.replace(self.path)


def _target_from_dict(raw: dict[str, Any]) -> Target:
    # Older state files predate level/role; unknown keys are ignored.
    known = Target.__dataclass_fields__
    return Target(**{k: v for k, v in raw.items() if k in known})


def _record_from_dict(raw: dict[str, Any]) -> ProblemRecord:
    return ProblemRecord(
        title=raw["title"],
        topic=raw["topic"],
        attempts=[Attempt(**{k: v for k, v in a.items() if k in Attempt.__dataclass_fields__}) for a in raw.get("attempts", [])],
        next_review=raw.get("next_review"),
        interval_days=raw.get("interval_days", 0),
        review_streak=raw.get("review_streak", 0),
    )
