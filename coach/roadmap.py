"""Roadmap loading and querying.

A roadmap is a fixed, ordered curriculum: topics in learning order, and
candidate problems within each topic in progression order. The MVP ships the
NeetCode 150 roadmap. The AI always knows where the user is and what comes next.

When the user targets a company, the coach extends the roadmap with that
company's frequently-asked problems that aren't already on it (see
:meth:`Roadmap.with_extras`). Those extras sort after the core curriculum and
carry a ``source`` so the UI can tell them apart.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, replace
from pathlib import Path

_DATA_DIR = Path(__file__).parent / "data"

# Topic used for company problems that aren't classic LeetCode questions
# (e.g. multi-stage "build an in-memory database" coding rounds).
PRACTICAL_TOPIC = "Practical Coding"


def norm_title(title: str) -> str:
    """Normalise a problem title for matching.

    NeetCode and LeetCode spell some titles differently
    ("Two Sum II Input Array Is Sorted" vs "Two Sum II - Input Array Is Sorted"),
    so lookups compare lowercase alphanumerics only.
    """
    return re.sub(r"[^a-z0-9]", "", title.lower())


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


@dataclass(frozen=True)
class Problem:
    title: str
    topic: str
    difficulty: str
    # Global position in the roadmap's recommended order (0-based).
    order: int
    # "roadmap" for the core curriculum, "company" for targeted extras.
    source: str = "roadmap"
    url: str = ""

    @property
    def link(self) -> str:
        if self.url:
            return self.url
        if self.source == "roadmap":
            return f"https://leetcode.com/problems/{slugify(self.title)}/"
        return ""


@dataclass(frozen=True)
class Roadmap:
    id: str
    name: str
    description: str
    problems: list[Problem]

    def by_title(self, title: str) -> Problem | None:
        key = norm_title(title)
        for p in self.problems:
            if norm_title(p.title) == key:
                return p
        return None

    def topics(self) -> list[str]:
        seen: list[str] = []
        for p in self.problems:
            if p.topic not in seen:
                seen.append(p.topic)
        return seen

    def with_extras(self, extras: list[dict]) -> "Roadmap":
        """Return a copy extended with company problems not already present.

        ``extras`` items need ``title``, ``topic``, ``difficulty`` and may carry
        ``url``. Existing roadmap titles win, so a company problem that is also
        a NeetCode problem keeps its roadmap position.
        """
        problems = list(self.problems)
        known = {norm_title(p.title) for p in problems}
        order = len(problems)
        for e in extras:
            key = norm_title(e["title"])
            if not key or key in known:
                continue
            known.add(key)
            problems.append(
                Problem(
                    title=e["title"],
                    topic=e.get("topic") or PRACTICAL_TOPIC,
                    difficulty=e.get("difficulty") or "Medium",
                    order=order,
                    source="company",
                    url=e.get("url", ""),
                )
            )
            order += 1
        return replace(self, problems=problems)


def available_roadmaps() -> list[str]:
    """Return the ids of roadmaps shipped with the app."""
    return sorted(p.stem for p in _DATA_DIR.glob("*.json"))


def load_roadmap(roadmap_id: str) -> Roadmap:
    """Load a roadmap by id (e.g. ``neetcode-150``)."""
    path = _DATA_DIR / f"{roadmap_id}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"Unknown roadmap {roadmap_id!r}. Available: {', '.join(available_roadmaps())}"
        )
    raw = json.loads(path.read_text())

    problems: list[Problem] = []
    order = 0
    for topic in raw["topics"]:
        for prob in topic["problems"]:
            problems.append(
                Problem(
                    title=prob["title"],
                    topic=topic["name"],
                    difficulty=prob["difficulty"],
                    order=order,
                )
            )
            order += 1

    return Roadmap(
        id=raw["id"],
        name=raw["name"],
        description=raw["description"],
        problems=problems,
    )
