"""Read-only access to a public LeetCode profile.

LeetCode has no official API; this uses the same public GraphQL endpoint its
website uses, which needs no login for public profile data:

  - solved counts by difficulty and by topic tag (the user's starting point),
  - the most recent accepted submissions (title, slug, time; LeetCode returns
    at most ~20), used to log solves automatically.

It never sends credentials and never writes anything to LeetCode. The endpoint
is unofficial, so every failure surfaces as a :class:`LeetCodeError` with a
plain message rather than breaking the coach.
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

ENDPOINT = "https://leetcode.com/graphql"
RECENT_LIMIT = 20  # LeetCode caps the public recent list at about this many
_USERNAME = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

_PROFILE_QUERY = """
query coachProfile($username: String!, $limit: Int!) {
  matchedUser(username: $username) {
    username
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    tagProblemCounts {
      fundamental { tagName problemsSolved }
      intermediate { tagName problemsSolved }
      advanced { tagName problemsSolved }
    }
  }
  recentAcSubmissionList(username: $username, limit: $limit) { title titleSlug timestamp }
}
"""


class LeetCodeError(RuntimeError):
    """Raised when the profile can't be read (bad username, network, API change)."""


def valid_username(name: str) -> bool:
    return bool(_USERNAME.match(name or ""))


def _post(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({"query": query, "variables": variables}).encode(),
        headers={
            "Content-Type": "application/json",
            "Referer": "https://leetcode.com",
            "User-Agent": "Mozilla/5.0 (leetcode-coach)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise LeetCodeError("LeetCode is rate-limiting requests; try again in a few minutes.") from exc
        raise LeetCodeError(f"LeetCode returned HTTP {exc.code}.") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise LeetCodeError(f"Couldn't reach LeetCode: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise LeetCodeError("LeetCode sent an unexpected response (the site may have changed).") from exc
    if payload.get("errors"):
        msg = payload["errors"][0].get("message", "unknown error")
        if "does not exist" in msg.lower():
            raise LeetCodeError(f"No public LeetCode profile named {variables.get('username')!r}.")
        raise LeetCodeError(f"LeetCode rejected the request: {msg}")
    return payload.get("data") or {}


def fetch_profile(username: str) -> dict[str, Any]:
    """Public profile summary plus recent accepted submissions.

    Returns ``{username, solved: {All, Easy, Medium, Hard}, tags: [{tag,
    solved}], recent: [{title, slug, timestamp, date}]}`` with tags sorted by
    count and ``date`` as the submission's ISO date (UTC).
    """
    if not valid_username(username):
        raise LeetCodeError("That doesn't look like a LeetCode username (letters, digits, - and _).")
    data = _post(_PROFILE_QUERY, {"username": username, "limit": RECENT_LIMIT})
    user = data.get("matchedUser")
    if not user:
        raise LeetCodeError(f"No public LeetCode profile named {username!r}.")

    solved = {
        row["difficulty"]: int(row["count"])
        for row in (user.get("submitStatsGlobal") or {}).get("acSubmissionNum", [])
    }
    tags: dict[str, int] = {}
    for level in (user.get("tagProblemCounts") or {}).values():
        for row in level or []:
            tags[row["tagName"]] = max(tags.get(row["tagName"], 0), int(row["problemsSolved"]))

    recent = []
    for row in data.get("recentAcSubmissionList") or []:
        try:
            ts = int(row["timestamp"])
        except (KeyError, TypeError, ValueError):
            continue
        recent.append(
            {
                "title": row["title"],
                "slug": row["titleSlug"],
                "timestamp": ts,
                "date": datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat(),
            }
        )

    return {
        "username": user.get("username") or username,
        "solved": {k: solved.get(k, 0) for k in ("All", "Easy", "Medium", "Hard")},
        "tags": [{"tag": t, "solved": n} for t, n in sorted(tags.items(), key=lambda kv: -kv[1]) if n > 0],
        "recent": sorted(recent, key=lambda r: r["timestamp"]),
    }
