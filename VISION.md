# AI Daily LeetCode Coach — Product Vision

This document is the north star for the project. It captures the long-term
vision and the intentionally-narrow MVP. Code and features should be judged
against the central philosophy below, not against how many LeetCode features
they add.

> **The one idea:** Every day, the AI decides exactly what I should practice.
>
> The user should never have to think about what to solve next, what to review,
> or whether they are following the roadmap correctly. The AI makes those
> decisions automatically.

This is **not** a LeetCode tracker, a dashboard, or a statistics tool. It is a
personal coach that manages the user's entire learning journey. The MVP focuses
on solving one problem extremely well: **generating the user's daily practice
plan based on their progress.**

---

## Long-term Vision

The product should feel like having a personal LeetCode coach rather than using
a tracking application. Over time the AI learns how the user studies, what they
struggle with, what concepts they repeatedly forget, and how quickly they master
topics — and continuously adapts the plan to maximize long-term retention and
interview readiness.

The complete vision has five components.

### 1. Curriculum
The AI understands the user's learning roadmap. For the MVP this is the NeetCode
roadmap. The roadmap defines learning order, topic structure, candidate
problems, and progression through topics. The roadmap itself is fixed. The AI
should always know where the user currently is and which topics come next.

### 2. Scheduler
The core intelligence of the product. Every day the AI decides:
- Which new questions to introduce.
- Which completed questions to review.
- How many questions fit within today's available study time.
- Whether today should prioritize new material or reinforcement.

Scheduling is personalized to the user's historical performance rather than a
static plan. **The Scheduler is the heart of the product.**

### 3. Memory
The AI remembers everything that matters about the user's learning history:
previous attempts, completion dates, solving time, whether hints were used,
whether the solution was viewed, whether the user solved it independently,
review history, and future review schedule. The user never maintains this
manually — the AI updates it after each session from natural-language feedback.

### 4. Coach *(not part of the MVP)*
Beyond scheduling, the AI eventually becomes a real coach that recognizes
patterns: recurring weaknesses, common implementation mistakes, conceptual gaps,
inefficient problem-solving habits, and topics needing more repetition. It
should provide personalized coaching rather than generic explanations.

### 5. Dashboard *(not the primary experience)*
Eventually the product provides useful summaries: roadmap progress, mastery by
topic, recent consistency, review backlog, long-term improvement. The dashboard
helps users understand progress, but the AI coach — not the dashboard — is the
product.

---

## MVP

The MVP intentionally ignores almost all long-term features and focuses on a
single question:

> **"What should I solve today?"**

Everything in the MVP exists only to answer that question well. It consists of
three user interactions.

### Step 1 — Initial Setup
The user chooses a roadmap (NeetCode for the MVP). From this point on, the AI
understands topic ordering, available questions, and the overall curriculum.

### Step 2 — Daily Planning
Each day the user tells the AI how much time they have (e.g. *"I have one hour
today."*). The AI generates a study plan that may include new questions, review
questions, and an estimated total workload. The user never manually decides what
to practice — that decision belongs entirely to the AI.

### Step 3 — Daily Feedback
After practicing, the user reports what happened in completely natural language:

> I spent 35 minutes on Group Anagrams. I looked at one hint but eventually
> solved it myself.
>
> Longest Consecutive Sequence completely stumped me. I ended up reading the
> solution.
>
> The two review questions were both easy and I solved them immediately.

No forms. No spreadsheets. No manual review scheduling. The AI extracts all
useful information automatically, updates the learning history, and determines
when each problem should appear again.

---

## Core Product Philosophy

The AI should behave like a **coach, not a database**. The user interacts through
conversation; the AI handles all organization behind the scenes. The user should
never think about:

- tracking progress
- scheduling reviews
- remembering previous attempts
- deciding what comes next

The AI owns those responsibilities.

### Design Principles
The MVP prioritizes simplicity; the experience should feel almost effortless.
The user only does two things:

1. Tell the AI how much time they have today.
2. Tell the AI how today's practice went.

Everything else happens automatically. Natural language is the primary
interface. No manual tracking, no complex setup, no forms, no spreadsheets.

---

## Extensibility

The MVP is intentionally small, but the architecture must support future
expansion without fundamental redesign. Future capabilities may include:

- personalized mistake analysis
- concept-level knowledge graphs
- adaptive spaced-repetition algorithms
- interview preparation mode
- company-specific practice plans
- weekly and monthly reports
- learning analytics
- progress dashboards
- multiple roadmap support
- custom roadmaps
- collaborative coaching
- AI-generated study plans for interviews with deadlines
- integration with LeetCode submissions
- voice conversations
- mobile notifications
- proactive daily reminders
- calendar integration
- AI-generated explanations tailored to the user's learning history

All of these build on the same core idea rather than replacing it. The central
philosophy remains unchanged:

> **The AI continuously observes the user's learning history, understands where
> they are within their roadmap, and decides exactly what they should practice
> next.**

Everything else is an enhancement of that single responsibility.

---

## Product Mission

The ultimate goal is not to help users solve more LeetCode problems. The goal is
to **remove the cognitive burden of managing the learning process itself.**

Instead of asking *"Which problem should I solve today?"* the user simply opens
the app and says *"I have 45 minutes."* — and the AI already knows everything
else.

---

## How Today's MVP Maps to the Vision

| Vision component | MVP status | Where it lives |
|---|---|---|
| Curriculum | ✅ Implemented (NeetCode 150, fixed) | `coach/roadmap.py`, `coach/data/` |
| Scheduler | ✅ Implemented (Claude decides the daily plan) | `coach/llm.py` (`generate_plan`), `coach/coach.py` |
| Memory | ✅ Implemented (auto-updated from NL feedback) | `coach/store.py`, `coach/llm.py` (`parse_feedback`), `coach/review.py` |
| Coach | 🟡 Company targeting: interview-deadline campaigns, company intel, readiness | `coach/companies.py`, `coach/llm.py` (`research_company`, `build_company_intel`, `generate_campaign`) |
| Dashboard | ✅ Local web dashboard + `progress` command | `coach/web.py`, `coach/static/` |

The seams above are deliberate: mistake analysis, custom roadmaps, adaptive
scheduling, and richer analytics can each slot into an existing module without a
redesign, because the intelligence lives in the model and the record is clean,
structured JSON.
