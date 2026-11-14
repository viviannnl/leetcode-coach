"""Claude-backed intelligence for the coach.

Every *decision* lives in the model rather than in hardcoded rules:

  - :func:`generate_plan`     — what to practise today (new + review problems).
  - :func:`parse_feedback`    — turn a plain-English recap into history updates.
  - :func:`research_company`  — search the web for recent interview reports.
  - :func:`build_company_intel` — merge dataset rows + web reports into a
    structured company profile (topics, weights, practical rounds).
  - :func:`generate_campaign` — the full week-by-week plan up to the interview.

All structured calls use the Messages API with structured outputs
(``output_config.format``) so the returned JSON validates against a schema.

Providers (``LEETCODE_COACH_PROVIDER``):
  - ``anthropic`` — the Claude API. Needs ``ANTHROPIC_API_KEY`` (or an
    ``ant auth login`` profile). Supports web search. Default when a key is set.
  - ``bedrock``   — Claude on Amazon Bedrock via AWS credentials. No web search,
    so company research falls back to the GitHub datasets only.
  - ``fake``      — deterministic offline stand-in for development and tests.
"""

from __future__ import annotations

import json
import os
from typing import Any

MODEL = os.environ.get("LEETCODE_COACH_MODEL", "claude-opus-5-5")

# Server-side refusal fallback (Claude API only): if a request is declined by a
# safety classifier, the API re-runs it on a suitable model inside the same call.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search", "max_uses": 12}


class LLMError(RuntimeError):
    """Raised when the model call fails or the SDK is missing."""


# --------------------------------------------------------------------------- #
# Provider plumbing
# --------------------------------------------------------------------------- #


def provider() -> str:
    explicit = os.environ.get("LEETCODE_COACH_PROVIDER", "").strip().lower()
    if explicit:
        return explicit
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "anthropic"
    if os.environ.get("CLAUDE_CODE_USE_BEDROCK") or os.environ.get("AWS_PROFILE"):
        return "bedrock"
    return "anthropic"


def supports_web_search() -> bool:
    return provider() in ("anthropic", "fake")


def _client():
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise LLMError(
            "The 'anthropic' package is required. Install it with:\n"
            "    pip install anthropic"
        ) from exc
    try:
        if provider() == "bedrock":
            return anthropic.AnthropicBedrockMantle(
                aws_region=os.environ.get("AWS_REGION", "us-west-2")
            )
        return anthropic.Anthropic()
    except Exception as exc:  # pragma: no cover - environment dependent
        raise LLMError(
            "Could not initialise the Anthropic client. Set ANTHROPIC_API_KEY "
            "(or LEETCODE_COACH_PROVIDER=bedrock with AWS credentials).\n"
            f"Original error: {exc}"
        ) from exc


def _model_id() -> str:
    if provider() == "bedrock" and not MODEL.startswith("anthropic."):
        return f"anthropic.{MODEL}"
    return MODEL


def _request(**kwargs: Any) -> Any:
    """Stream one request and return the final message.

    Streaming keeps long research/planning turns clear of HTTP timeouts. On the
    Claude API we opt into server-side refusal fallbacks; Bedrock doesn't offer
    them, so there a refusal surfaces as an :class:`LLMError`.
    """
    import anthropic

    client = _client()
    params = dict(model=_model_id(), max_tokens=32000, **kwargs)
    try:
        if provider() == "anthropic":
            with client.beta.messages.stream(
                betas=[_FALLBACK_BETA], fallbacks="default", **params
            ) as stream:
                return stream.get_final_message()
        with client.messages.stream(**params) as stream:
            return stream.get_final_message()
    except anthropic.NotFoundError as exc:
        raise LLMError(f"Model {params['model']!r} was not found for this account.") from exc
    except anthropic.AuthenticationError as exc:
        raise LLMError(
            "Authentication failed. Set ANTHROPIC_API_KEY, or use "
            "LEETCODE_COACH_PROVIDER=bedrock with valid AWS credentials."
        ) from exc
    except anthropic.RateLimitError as exc:
        raise LLMError("Rate limited by the API — try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise LLMError(f"Model request failed ({exc.status_code}): {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise LLMError(f"Could not reach the model API: {exc}") from exc


def _check_refusal(response: Any) -> None:
    if response.stop_reason == "refusal":
        raise LLMError("The model declined to respond to this request.")


def _first_text(response: Any) -> str:
    for block in response.content:
        if block.type == "text":
            return block.text
    raise LLMError("Model returned no text content.")


def _call_structured(
    system: str, user: str, schema: dict[str, Any], effort: str = "medium"
) -> dict[str, Any]:
    response = _request(
        thinking={"type": "adaptive"},
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    _check_refusal(response)
    if response.stop_reason == "max_tokens":
        raise LLMError("The model ran out of output room; try again.")
    text = _first_text(response)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise LLMError(f"Model returned invalid JSON: {text[:200]}") from exc


def _fake():
    from . import fake_llm

    return fake_llm


# --------------------------------------------------------------------------- #
# Plan generation
# --------------------------------------------------------------------------- #

_PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "focus": {
            "type": "string",
            "description": "Whether today leans toward new material or review.",
            "enum": ["new", "review", "balanced"],
        },
        "coach_note": {
            "type": "string",
            "description": "One or two friendly sentences to the user about today's plan and why.",
        },
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Exact problem title from the roadmap."},
                    "kind": {"type": "string", "enum": ["new", "review"]},
                    "estimated_minutes": {"type": "integer"},
                    "reason": {
                        "type": "string",
                        "description": "Short reason this problem was chosen for today.",
                    },
                },
                "required": ["title", "kind", "estimated_minutes", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["focus", "coach_note", "items"],
    "additionalProperties": False,
}

_PLAN_SYSTEM = """You are an expert LeetCode coach. Each day you decide exactly \
what the user should practice, so they never have to think about it themselves.

You are given:
  - the user's roadmap (topic order and candidate problems). It may include \
problems sourced from a target company (source "company") after the core \
curriculum, including "Practical Coding" rounds that aren't LeetCode problems,
  - their full learning history (attempts, outcomes, review schedule),
  - how many minutes they have today and today's date,
  - optionally a target company + interview date, the company's intel (which \
problems and topics it emphasises) and this week's slice of the multi-week \
campaign plan.

Produce a focused daily plan that fits the available time. Principles:
  - If there's a campaign week, follow it: prefer its problems and topics. \
Deviate only for due reviews or if the user is clearly struggling.
  - Respect the roadmap order for core topics, but with an interview date \
approaching, prioritise what the target company asks over roadmap completeness.
  - Prioritise reviews that are due (next_review on or before today).
  - Balance new learning against reinforcement based on recent performance.
  - Only choose problems that exist in the roadmap, using their exact titles.
  - Estimate minutes realistically (reviews are faster; practical rounds take \
45-90 minutes). The sum should fit the available time with a little slack.
  - If almost no time is available, a single quick review is fine.

Choose the smallest set of problems that makes today productive."""


def generate_plan(context: dict[str, Any]) -> dict[str, Any]:
    """Ask the model for today's plan. ``context`` is a JSON-serialisable dict."""
    if provider() == "fake":
        return _fake().generate_plan(context)
    user = (
        "Here is everything you need to plan today's session.\n\n"
        + json.dumps(context, indent=2)
        + "\n\nProduce the plan."
    )
    return _call_structured(_PLAN_SYSTEM, user, _PLAN_SCHEMA, effort="medium")


# --------------------------------------------------------------------------- #
# Feedback parsing
# --------------------------------------------------------------------------- #

_FEEDBACK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "updates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Exact roadmap title of a problem the user reported on.",
                    },
                    "outcome": {
                        "type": "string",
                        "enum": [
                            "solved_independently",
                            "solved_with_hints",
                            "viewed_solution",
                            "gave_up",
                            "reviewed_easily",
                            "struggled",
                        ],
                        "description": "How the session went for this problem.",
                    },
                    "minutes": {
                        "type": ["integer", "null"],
                        "description": "Minutes spent, if mentioned; otherwise null.",
                    },
                    "used_hint": {"type": "boolean"},
                    "viewed_solution": {"type": "boolean"},
                    "notes": {
                        "type": "string",
                        "description": "Brief note capturing anything useful (a struggle, a concept, a mistake).",
                    },
                },
                "required": ["title", "outcome", "minutes", "used_hint", "viewed_solution", "notes"],
                "additionalProperties": False,
            },
        },
        "coach_note": {
            "type": "string",
            "description": "One or two encouraging, specific sentences reacting to how the session went.",
        },
        "unmatched": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Anything the user mentioned that could not be matched to a roadmap problem.",
        },
    },
    "required": ["updates", "coach_note", "unmatched"],
    "additionalProperties": False,
}

_FEEDBACK_SYSTEM = """You are an expert LeetCode coach reading a user's free-form \
recap of a practice session. Extract, for each problem they mention, exactly what \
happened so their learning history can be updated automatically. The user never \
fills out forms — you infer everything from their words.

You are given the list of problems that were on today's plan (with exact titles) \
plus the roadmap of all valid problems. Rules:
  - Match each thing the user describes to the correct roadmap problem by its \
exact title. Prefer titles from today's plan, but a user may also mention a \
different problem they did.
  - Classify the outcome honestly:
      solved_independently — solved with no help
      solved_with_hints    — solved but used a hint / looked something up
      viewed_solution      — ended up reading the solution
      gave_up              — did not finish and did not read the solution
      reviewed_easily      — a review problem that was quick/easy
      struggled            — a review problem that was hard or slow
  - Set used_hint / viewed_solution to reflect what they said.
  - Fill minutes only if a duration is stated or clearly implied; otherwise null.
  - Keep notes short and specific (the concept they missed, the bug they hit).
  - If they mention something you cannot map to a roadmap problem, list the raw \
phrase in "unmatched" rather than guessing.
  - Do not invent problems that weren't mentioned."""


def parse_feedback(context: dict[str, Any]) -> dict[str, Any]:
    """Extract structured updates from the user's natural-language recap."""
    if provider() == "fake":
        return _fake().parse_feedback(context)
    user = (
        "Today's plan and the roadmap:\n\n"
        + json.dumps(context["reference"], indent=2)
        + "\n\nThe user's recap of how it went:\n\n"
        + context["feedback"]
        + "\n\nExtract the structured updates."
    )
    return _call_structured(_FEEDBACK_SYSTEM, user, _FEEDBACK_SCHEMA, effort="medium")


# --------------------------------------------------------------------------- #
# Company research (web)
# --------------------------------------------------------------------------- #

_RESEARCH_SYSTEM = """You are researching how a specific company runs its \
software-engineering coding interviews, to help one candidate prepare.

Search the public web for first-hand, recent reports: Reddit (r/leetcode, \
r/cscareerquestions, r/csMajors), Blind, LeetCode Discuss interview \
experiences, Glassdoor, 1point3acres, personal blogs. Prefer the last 12 months. \
Search several different phrasings.

Write a factual research report with these sections:
  1. Interview format — online assessment, phone screen, onsite rounds, \
platform (e.g. CodeSignal), time limits, languages.
  2. Reported questions — every specific question you find. For each give the \
LeetCode title if it maps to a LeetCode problem (or "no LeetCode equivalent"), \
a one-line description, roughly when it was reported, and the source URL.
  3. Practical / non-LeetCode rounds — e.g. multi-part "build an in-memory \
store" tasks, concurrency, debugging, API design. Describe each concretely.
  4. Topic emphasis — which algorithm/data-structure areas come up most, \
and which rarely do.
  5. Candidate advice that recurs across reports.

Only state what the sources support; mark anything thin as low confidence. \
Cite the source URL inline for every claim."""


def research_company(company: str) -> dict[str, Any]:
    """Search the web for interview reports. Returns ``{notes, sources}``."""
    if provider() == "fake":
        return _fake().research_company(company)
    if not supports_web_search():
        raise LLMError(
            "Web search isn't available on this provider (Bedrock). "
            "Set ANTHROPIC_API_KEY to include web reports."
        )

    messages: list[dict[str, Any]] = [
        {
            "role": "user",
            "content": f"Research {company}'s software engineering coding interviews.",
        }
    ]
    response = None
    for _ in range(5):  # resume server-side pauses, bounded
        response = _request(
            thinking={"type": "adaptive"},
            output_config={"effort": "medium"},
            system=_RESEARCH_SYSTEM,
            messages=messages,
            tools=[_WEB_SEARCH_TOOL],
        )
        _check_refusal(response)
        if response.stop_reason != "pause_turn":
            break
        messages = messages[:1] + [{"role": "assistant", "content": response.content}]

    notes_parts: list[str] = []
    sources: dict[str, dict[str, str]] = {}
    for block in response.content:
        if block.type == "text":
            notes_parts.append(block.text)
            for c in getattr(block, "citations", None) or []:
                url = getattr(c, "url", None)
                if url and url not in sources:
                    sources[url] = {"url": url, "title": getattr(c, "title", "") or url}
        elif block.type == "web_search_tool_result":
            content = block.content
            if isinstance(content, list):  # an error result is an object, not a list
                for r in content:
                    url = getattr(r, "url", None)
                    if url and url not in sources:
                        sources[url] = {"url": url, "title": getattr(r, "title", "") or url}

    notes = "".join(notes_parts).strip()
    if not notes:
        raise LLMError("Web research returned no report.")
    return {"notes": notes, "sources": list(sources.values())}


# --------------------------------------------------------------------------- #
# Company intel (merge datasets + web into a profile)
# --------------------------------------------------------------------------- #


def _intel_schema(topics: list[str]) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "interview_format": {
                "type": "string",
                "description": "2-4 sentences: rounds, platform, timing, what they assess.",
            },
            "advice": {
                "type": "array",
                "items": {"type": "string"},
                "description": "3-6 short, specific prep tips that recur in the evidence.",
            },
            "topic_weights": {
                "type": "array",
                "description": "How much the company emphasises each relevant topic.",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic": {"type": "string", "enum": topics},
                        "weight": {
                            "type": "number",
                            "description": "0.0 (never asked) to 1.0 (core focus).",
                        },
                        "why": {"type": "string"},
                    },
                    "required": ["topic", "weight", "why"],
                    "additionalProperties": False,
                },
            },
            "problems": {
                "type": "array",
                "description": "Every problem the candidate should practise for this company.",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {
                            "type": "string",
                            "description": "LeetCode title (exact roadmap title if it is on the roadmap), or a short name for a practical task.",
                        },
                        "kind": {"type": "string", "enum": ["leetcode", "practical"]},
                        "topic": {"type": "string", "enum": topics},
                        "difficulty": {"type": "string", "enum": ["Easy", "Medium", "Hard"]},
                        "url": {
                            "type": "string",
                            "description": "LeetCode URL if known, else empty string.",
                        },
                        "description": {
                            "type": "string",
                            "description": "One line: what the task is (required for practical tasks).",
                        },
                        "weight": {
                            "type": "number",
                            "description": "0.0-1.0 likelihood/importance for this company.",
                        },
                        "evidence": {
                            "type": "string",
                            "description": "Why it's here: dataset frequency/recency and/or what reports say.",
                        },
                        "evidence_urls": {"type": "array", "items": {"type": "string"}},
                        "from_dataset": {"type": "boolean"},
                        "from_web": {"type": "boolean"},
                    },
                    "required": [
                        "title", "kind", "topic", "difficulty", "url", "description",
                        "weight", "evidence", "evidence_urls", "from_dataset", "from_web",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["interview_format", "advice", "topic_weights", "problems"],
        "additionalProperties": False,
    }


_INTEL_SYSTEM = """You turn raw evidence about a company's coding interviews \
into a structured prep profile for one candidate.

Evidence comes from (a) public LeetCode company-tag datasets with frequency \
and recency window, and (b) a web research report with cited sources. Rules:
  - Include every dataset problem. Weight by frequency and recency (last 30 \
days / 3 months beats "6+ months ago" or "all time").
  - Add problems the web report names. If a reported question maps to a \
LeetCode problem, use the LeetCode title — and if that problem is on the \
roadmap, use the exact roadmap title.
  - Practical rounds with no LeetCode equivalent become kind "practical" \
with topic "Practical Coding" and a concrete one-line description.
  - Add a handful (up to ~8) of closely related roadmap problems that train \
the same skills as the company's signature questions, marked from_dataset \
false / from_web false, with evidence explaining the link. Don't pad beyond that.
  - topic_weights: cover each roadmap topic that matters for this company. \
Use the evidence; where it's thin, say so in "why" and keep weights moderate.
  - Never invent sources. evidence_urls must come from the report."""


def build_company_intel(context: dict[str, Any]) -> dict[str, Any]:
    if provider() == "fake":
        return _fake().build_company_intel(context)
    user = (
        "Build the prep profile from this evidence.\n\n"
        + json.dumps(context, indent=2)
    )
    return _call_structured(
        _INTEL_SYSTEM, user, _intel_schema(context["valid_topics"]), effort="high"
    )


# --------------------------------------------------------------------------- #
# Campaign (the full multi-week plan)
# --------------------------------------------------------------------------- #

_CAMPAIGN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "2-3 sentences: the overall strategy from today to the interview.",
        },
        "weeks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "ISO date (Monday or today for week 1)."},
                    "end": {"type": "string", "description": "ISO date."},
                    "theme": {"type": "string", "description": "Short headline for the week."},
                    "goal": {"type": "string", "description": "One sentence: what 'done' looks like."},
                    "focus_topics": {"type": "array", "items": {"type": "string"}},
                    "problems": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string", "description": "Exact roadmap title."},
                                "kind": {"type": "string", "enum": ["new", "review"]},
                            },
                            "required": ["title", "kind"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["start", "end", "theme", "goal", "focus_topics", "problems"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "weeks"],
    "additionalProperties": False,
}

_CAMPAIGN_SYSTEM = """You are an expert interview coach planning a candidate's \
preparation from today until their interview date, week by week.

You get today's date, the interview date, typical minutes per day, the roadmap \
with the user's status on every problem, and (optionally) the target company's \
intel: problem weights, topic weights, interview format.

Plan principles:
  - Cover the weeks from today through the interview date; the first week \
starts today, the last ends on the interview date.
  - Size each week to the time budget: roughly (minutes/day x 7) / 35 problems \
per week, fewer for Hard and practical tasks. Never overload.
  - Front-load what the company asks most and the foundations those problems \
need. A company's signature problems need prerequisites first (e.g. BFS/DFS \
before a concurrent web crawler).
  - Schedule practical rounds as full sessions, and repeat the highest-weight \
company problems as reviews in later weeks.
  - The final week before the interview is consolidation: reviews of \
high-weight problems, timed practice, no new hard topics.
  - Skip problems the user already solved unless scheduling them as review.
  - Only use exact roadmap titles."""


def generate_campaign(context: dict[str, Any]) -> dict[str, Any]:
    if provider() == "fake":
        return _fake().generate_campaign(context)
    user = "Plan the campaign.\n\n" + json.dumps(context, indent=2)
    return _call_structured(_CAMPAIGN_SYSTEM, user, _CAMPAIGN_SCHEMA, effort="high")
