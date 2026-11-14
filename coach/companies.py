"""Company intel: which problems a target company actually asks.

Two kinds of evidence are merged into one profile per company:

  1. **Public GitHub datasets** of LeetCode company tags with frequency, split
     by recency window (last 30 days ... all time). Fetched live from GitHub.
  2. **Public web reports** (interview write-ups on Reddit, Blind, LeetCode
     Discuss, Glassdoor, blogs) gathered by Claude with web search — these add
     recent questions, non-LeetCode "practical" rounds, and topic emphasis that
     the datasets miss.

The merged profile lives at ``~/.leetcode-coach/companies/<slug>.json`` and is
plain JSON, like the rest of the coach's memory.

This module also computes **readiness**: how prepared the user is for the
company, from the profile and their own history.
"""

from __future__ import annotations

import csv
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from .roadmap import norm_title
from .store import State

# --------------------------------------------------------------------------- #
# Datasets
# --------------------------------------------------------------------------- #

# Recency windows, most recent first. Index doubles as a recency rank.
WINDOWS = ["thirty-days", "three-months", "six-months", "more-than-six-months", "all"]

WINDOW_LABELS = {
    "thirty-days": "last 30 days",
    "three-months": "last 3 months",
    "six-months": "last 6 months",
    "more-than-six-months": "6+ months ago",
    "all": "all time",
}


@dataclass(frozen=True)
class DatasetSource:
    repo: str  # "owner/name" on GitHub
    files: dict[str, str]  # window -> file name inside the company folder


DATASETS = [
    DatasetSource(
        repo="snehasishroy/leetcode-companywise-interview-questions",
        files={w: f"{w}.csv" for w in WINDOWS},
    ),
    DatasetSource(
        repo="liquidslr/interview-company-wise-problems",
        files={
            "thirty-days": "1. Thirty Days.csv",
            "three-months": "2. Three Months.csv",
            "six-months": "3. Six Months.csv",
            "more-than-six-months": "4. More Than Six Months.csv",
            "all": "5. All.csv",
        },
    ),
]


def company_slug(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _http_get(url: str, accept: str = "application/vnd.github.raw") -> bytes:
    headers = {"Accept": accept, "User-Agent": "leetcode-coach"}
    token = os.environ.get("GITHUB_TOKEN")
    if token and "api.github.com" in url:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def _find_company_folder(repo: str, company: str) -> str | None:
    """Folder names differ per repo ("anthropic", "Anthropic", "OpenAI")."""
    listing = json.loads(
        _http_get(f"https://api.github.com/repos/{repo}/contents", "application/json")
    )
    want = company_slug(company)
    for entry in listing:
        if entry.get("type") == "dir" and company_slug(entry["name"]) == want:
            return entry["name"]
    return None


def _parse_pct(raw: str | None) -> float:
    if not raw:
        return 0.0
    try:
        return float(raw.strip().rstrip("%"))
    except ValueError:
        return 0.0


def _parse_rows(text: str) -> list[dict[str, Any]]:
    """Normalise both repos' CSV layouts into one shape."""
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        title = (r.get("Title") or "").strip()
        if not title:
            continue
        url = (r.get("URL") or r.get("Link") or "").strip()
        rows.append(
            {
                "title": title,
                "url": url,
                "difficulty": (r.get("Difficulty") or "").strip().capitalize(),
                "frequency": _parse_pct(r.get("Frequency %") or r.get("Frequency")),
                "tags": [t.strip() for t in (r.get("Topics") or "").split(",") if t.strip()],
            }
        )
    return rows


def fetch_datasets(company: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Fetch and merge every dataset's rows for ``company``.

    Returns ``(problems, sources)``. Each problem has the best (max) frequency
    seen, the most recent window it appeared in, and union of tags. Network
    failures for one repo don't stop the others; they're reported in sources.
    """
    merged: dict[str, dict[str, Any]] = {}
    sources: list[dict[str, Any]] = []

    for ds in DATASETS:
        try:
            folder = _find_company_folder(ds.repo, company)
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            sources.append({"kind": "dataset", "title": ds.repo, "url": f"https://github.com/{ds.repo}", "status": f"error: {exc}"})
            continue
        if folder is None:
            sources.append({"kind": "dataset", "title": ds.repo, "url": f"https://github.com/{ds.repo}", "status": "company not listed"})
            continue

        found = 0
        for window, fname in ds.files.items():
            raw_url = (
                f"https://raw.githubusercontent.com/{ds.repo}/HEAD/"
                f"{urllib.parse.quote(folder)}/{urllib.parse.quote(fname)}"
            )
            try:
                text = _http_get(raw_url).decode("utf-8", "replace")
            except urllib.error.HTTPError as exc:
                if exc.code == 404:
                    continue  # this repo doesn't have that window for the company
                raise
            except (urllib.error.URLError, TimeoutError):
                continue
            for row in _parse_rows(text):
                found += 1
                key = norm_title(row["title"])
                cur = merged.get(key)
                if cur is None:
                    cur = {
                        "title": row["title"],
                        "url": row["url"],
                        "difficulty": row["difficulty"] or "Medium",
                        "frequency": 0.0,
                        "recency": window,
                        "tags": [],
                        "datasets": [],
                    }
                    merged[key] = cur
                cur["frequency"] = max(cur["frequency"], row["frequency"])
                if WINDOWS.index(window) < WINDOWS.index(cur["recency"]):
                    cur["recency"] = window
                for t in row["tags"]:
                    if t not in cur["tags"]:
                        cur["tags"].append(t)
                if ds.repo not in cur["datasets"]:
                    cur["datasets"].append(ds.repo)
                if not cur["url"] and row["url"]:
                    cur["url"] = row["url"]

        sources.append(
            {
                "kind": "dataset",
                "title": ds.repo,
                "url": f"https://github.com/{ds.repo}/tree/HEAD/{urllib.parse.quote(folder)}",
                "status": f"{found} rows",
            }
        )

    problems = sorted(merged.values(), key=lambda p: -p["frequency"])
    return problems, sources


# --------------------------------------------------------------------------- #
# Profile storage
# --------------------------------------------------------------------------- #


def companies_dir(state_path: Path) -> Path:
    return state_path.parent / "companies"


def profile_path(state_path: Path, company: str) -> Path:
    return companies_dir(state_path) / f"{company_slug(company)}.json"


def load_profile(state_path: Path, company: str) -> dict[str, Any] | None:
    path = profile_path(state_path, company)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def save_profile(state_path: Path, profile: dict[str, Any]) -> None:
    path = profile_path(state_path, profile["company"])
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(profile, indent=2, sort_keys=True))
    tmp.replace(path)


# --------------------------------------------------------------------------- #
# Readiness
# --------------------------------------------------------------------------- #

# How much one problem counts as "ready", by its latest state.
_MASTERY = {
    None: 0.0,  # never attempted
    "gave_up": 0.1,
    "viewed_solution": 0.25,
    "struggled": 0.4,
    "solved_with_hints": 0.5,
    "solved_independently": 0.8,
    "reviewed_easily": 0.9,
}


def problem_mastery(state: State, title: str, today: date) -> float:
    rec = None
    key = norm_title(title)
    for t, r in state.records.items():
        if norm_title(t) == key:
            rec = r
            break
    if rec is None or not rec.attempts:
        return 0.0
    m = _MASTERY.get(rec.last_attempt.outcome, 0.3)
    if rec.solved and rec.review_streak >= 2:
        m = max(m, 1.0)
    # A review that's overdue has probably faded a bit.
    if rec.next_review and rec.next_review < today.isoformat():
        m *= 0.85
    return round(m, 3)


def _weighted_mastery(state: State, items: list[dict[str, Any]], today: date) -> tuple[float, float]:
    """(weighted mastery 0-1, total weight) over profile problems."""
    num = den = 0.0
    for p in items:
        w = max(float(p.get("weight", 0.0)), 0.05)
        num += w * problem_mastery(state, p["title"], today)
        den += w
    return (num / den if den else 0.0), den


def readiness(state: State, profile: dict[str, Any], roadmap: Any, today: date) -> dict[str, Any]:
    """Score how ready the user is for this company's loop (0-100).

    Each practice track gets a score:
      - algorithms: mean of *problem coverage* (frequency-weighted mastery of
        the company's coding problems) and *topic strength* (company topic
        emphasis × the user's mastery of each topic).
      - practical: weighted mastery of the company's practical tasks.
      - system_design: mastery of the company's reported design prompts, blended
        with the design curriculum so prompts nobody reported still count.
    Each interview round takes its track's score; overall is the round-weighted
    mean over rounds the coach can train. Rounds with no practice track
    (behavioral, code review…) are reported as untracked, not guessed.
    """
    problems = profile.get("problems", [])
    by_kind = {k: [p for p in problems if p.get("kind", "leetcode") == k] for k in ("leetcode", "practical", "design")}

    coverage, cov_w = _weighted_mastery(state, by_kind["leetcode"], today)

    topic_progress: dict[str, float] = {}
    for topic in roadmap.topics():
        probs = [p for p in roadmap.problems if p.topic == topic]
        topic_progress[topic] = sum(problem_mastery(state, p.title, today) for p in probs) / len(probs)
    t_num = t_den = 0.0
    per_topic = []
    for t in profile.get("topic_weights", []):
        w = float(t.get("weight", 0.0))
        prog = topic_progress.get(t["topic"], 0.0)
        t_num += w * prog
        t_den += w
        per_topic.append({"topic": t["topic"], "weight": w, "progress": round(prog, 3)})
    strength = t_num / t_den if t_den else 0.0
    algo_parts = [x for x, n in ((coverage, cov_w), (strength, t_den)) if n]
    algorithms = sum(algo_parts) / len(algo_parts) if algo_parts else 0.0

    practical, prac_w = _weighted_mastery(state, by_kind["practical"], today)

    design_curriculum = [p for p in roadmap.problems if p.track == "system_design" and p.source == "design"]
    curriculum = (
        sum(problem_mastery(state, p.title, today) for p in design_curriculum) / len(design_curriculum)
        if design_curriculum else 0.0
    )
    reported, rep_w = _weighted_mastery(state, by_kind["design"], today)
    design = 0.6 * reported + 0.4 * curriculum if rep_w else curriculum

    tracks = {"algorithms": algorithms, "practical": practical if prac_w else None, "system_design": design}

    rounds = profile.get("rounds") or [
        # Profiles from before loop-aware intel: treat the loop as coding only.
        {"name": "Coding", "track": "algorithms", "weight": 0.5, "description": ""},
        {"name": "Practical coding", "track": "practical", "weight": 0.5, "description": ""},
    ]
    per_round = []
    num = den = untracked = 0.0
    for r in rounds:
        score = tracks.get(r["track"])
        if r["track"] == "practical" and score is None:
            score = algorithms  # no practical tasks found: coding practice is the closest proxy
        per_round.append({**r, "score": None if score is None else round(score * 100)})
        if score is None:
            untracked += r["weight"]
        else:
            num += r["weight"] * score
            den += r["weight"]
    overall = num / den if den else 0.0

    weakest = sorted(
        (t for t in per_topic if t["weight"] >= 0.4),
        key=lambda t: t["progress"] - t["weight"],
    )[:3]

    return {
        "overall": round(overall * 100),
        "rounds": per_round,
        "untracked_weight": round(untracked, 3),
        "tracks": {k: (None if v is None else round(v * 100)) for k, v in tracks.items()},
        "problem_coverage": round(coverage * 100),
        "topic_strength": round(strength * 100),
        "problems": [{"title": p["title"], "mastery": problem_mastery(state, p["title"], today)} for p in problems],
        "topics": per_topic,
        "weak_spots": [t["topic"] for t in weakest if t["progress"] < 0.7],
    }
