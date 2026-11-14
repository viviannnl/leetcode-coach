"""Spaced-repetition scheduling.

When an attempt is recorded, we compute when the problem should next resurface.
This is deliberately simple and deterministic — the *selection* of what to
practice is the AI's job (see :mod:`coach.llm`); this module just maintains the
review schedule so due problems exist for the AI to pick from.

The intervals follow a light SM-2-style progression. Everything is stored on the
:class:`~coach.store.ProblemRecord` so it stays inspectable and extensible.
"""

from __future__ import annotations

from datetime import date, timedelta

from .store import Attempt, ProblemRecord

# Growth ladder (in days) for successful reviews.
_INTERVALS = [1, 3, 7, 16, 35, 90]


def _advance(streak: int) -> int:
    idx = min(streak, len(_INTERVALS) - 1)
    return _INTERVALS[idx]


def apply_attempt(record: ProblemRecord, attempt: Attempt, today: date) -> None:
    """Append an attempt and update the review schedule in place."""
    record.attempts.append(attempt)

    good = attempt.outcome in ("solved_independently", "reviewed_easily")
    partial = attempt.outcome == "solved_with_hints"
    poor = attempt.outcome in ("viewed_solution", "gave_up", "struggled")

    if poor:
        # Reset — see it again very soon.
        record.review_streak = 0
        record.interval_days = 1
    elif partial:
        # Made progress but leaned on help; small step, don't advance streak.
        record.interval_days = max(2, record.interval_days)
        record.review_streak = max(record.review_streak, 1)
    else:  # good
        record.review_streak += 1
        record.interval_days = _advance(record.review_streak)

    record.next_review = (today + timedelta(days=record.interval_days)).isoformat()


def rebuild(record: ProblemRecord) -> None:
    """Recompute the review schedule from scratch by replaying every attempt.

    Used when an attempt is replaced (e.g. a recap supersedes a synced solve),
    so the interval and streak reflect the final history, not both versions.
    """
    attempts = list(record.attempts)
    record.attempts = []
    record.review_streak = 0
    record.interval_days = 0
    record.next_review = None
    for a in attempts:
        apply_attempt(record, a, date.fromisoformat(a.date))


def is_due(record: ProblemRecord, today: date) -> bool:
    if not record.next_review:
        return False
    return record.next_review <= today.isoformat()
