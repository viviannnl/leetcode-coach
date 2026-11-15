# AI Daily LeetCode Coach

An AI coach that decides exactly what you should practice each day. Not a
tracker, not a dashboard — a coach. You only ever do two things:

1. Tell it how much time you have today.
2. Tell it (in plain English) how the session went.

The AI owns everything else: where you are on the roadmap, what to introduce
next, what to review, and when each problem should come back.

See [VISION.md](VISION.md) for the long-term product vision and how today's MVP
maps to it.

```
$ leetcode-coach plan 45

Today's a mix: two fresh Arrays & Hashing problems plus a quick review of
Two Sum to keep it warm.

Focus: a mix of new & review

  1. Two Sum  [review]
     Arrays & Hashing · Easy · ~8 min
     You solved this last week — a fast refresh before building on it.
  2. Group Anagrams  [new]
     Arrays & Hashing · Medium · ~22 min
     Next in your roadmap; builds directly on hashing patterns.
  ...

$ leetcode-coach done "Group Anagrams took me 25 min, needed one hint on the
  sorting key. Two Sum was instant."

Recorded:
  ✓ Group Anagrams  (solved with hints)   → review around 2026-07-14
  ✓ Two Sum  (reviewed easily)            → review around 2026-08-16

Nice — the hint on Group Anagrams was just the key-choice; the pattern itself
clearly landed. I'll surface it again in a couple of days to lock it in.
```

## How it works

- **Curriculum** — a fixed roadmap (NeetCode 150 in the MVP): topic order and
  candidate problems. The coach always knows where you are and what's next.
- **Scheduler** — Claude decides your daily plan from your history and today's
  available time, balancing new material against due reviews.
- **Memory** — every attempt, outcome, hint, and review date is stored as plain
  JSON and updated automatically from your natural-language feedback. You never
  edit it by hand.

The intelligence (planning + reading your feedback) runs through Claude with
structured outputs; the record it maintains is clean JSON so future features
(analytics, dashboards, custom roadmaps) build on the same foundation.

## Install

```bash
pip install -e .
```

Save your Anthropic API key once, readable only by you:

```bash
mkdir -p ~/.leetcode-coach
(umask 077; printf '%s' 'sk-ant-...' > ~/.leetcode-coach/anthropic.key)
```

Every command picks it up automatically. An exported `ANTHROPIC_API_KEY` (or an
`ant auth login` profile) still takes precedence, and a key file readable by
other users is refused with a `chmod 600` hint.

## Use

```bash
leetcode-coach init            # choose a roadmap (once)
leetcode-coach plan 45         # "I have 45 minutes" -> today's plan
leetcode-coach done "..."      # recap your session in plain English
leetcode-coach progress        # a quick look at where you are
```

`plan` accepts natural phrasings too: `plan "1 hour"`, `plan 90m`.

If you don't want to install, run it as a module: `python -m coach plan 45`.

Your history lives at `~/.leetcode-coach/state.json` (override with
`LEETCODE_COACH_HOME` or `--state`).

## Preparing for a specific company

Tell the coach who you're interviewing with and when. It learns what that
company asks, plans every week until the interview, and tilts each daily plan
toward it.

```bash
leetcode-coach target Anthropic --date 2026-12-25 --level mid --minutes 60
#   --level intern | new_grad | mid | senior | staff   --role "..."   --posting job.txt
leetcode-coach research        # the loop at that level + what they ask: datasets + web reports
leetcode-coach campaign        # the week-by-week plan to the interview
leetcode-coach progress        # now includes readiness + weak spots
```

**Where the intel comes from**

- **GitHub datasets** of LeetCode company tags with frequency and recency
  ([snehasishroy](https://github.com/snehasishroy/leetcode-companywise-interview-questions),
  [liquidslr](https://github.com/liquidslr/interview-company-wise-problems)),
  fetched live. Set `GITHUB_TOKEN` if you hit GitHub's anonymous rate limit.
  These are community snapshots of LeetCode Premium data, so coverage varies:
  Anthropic has only 4 tagged problems; big companies have hundreds.
- **Web reports.** Claude searches Reddit, Blind, LeetCode Discuss, Glassdoor
  and blogs for recent interview write-ups, including practical rounds with no
  LeetCode equivalent (these become "Practical Coding" problems you can be
  scheduled on). Every web claim keeps its source URL.

Claude merges both into `~/.leetcode-coach/companies/<company>.json`: weighted
problems, topic emphasis, interview format and advice. Company problems that
aren't on the NeetCode 150 are appended to your roadmap automatically.

**The interview loop.** Research reports the company's actual rounds at your
level, in its own names ("CodeSignal OA", "Culture / Values"), each tagged with
the practice track that trains it: algorithms, practical coding, or system
design. Rounds no track covers yet (behavioral, code review…) are shown as
"not covered", never silently dropped. The weekly plan splits your time across
tracks by round weight, so an Anthropic plan has no LeetCode time at all if the
loop has no algorithms round.

**Readiness** is per round: each round takes its track's score, and the overall
number is the round-weighted mean over the rounds the coach can train. For the
algorithms track, the score is the mean of *problem coverage* (frequency-weighted
mastery of the company's own problems) and *topic strength* (the company's
topic emphasis weighted by your mastery of each topic), so neither grinding the
list nor ignoring it scores well alone.

## LeetCode account (optional)

```bash
leetcode-coach leetcode your_username     # link (public profile, read-only, no password)
leetcode-coach leetcode                   # sync now
leetcode-coach leetcode --unlink
```

Or link it in the dashboard's Activity panel. The coach reads your **public**
profile through LeetCode's website data endpoint (unofficial, no login):

- **Recent accepted submissions** (about the last 20) are logged automatically
  as solved attempts for problems on your plan, so `done` only needs to add how
  it went. A recap of the same problem that day replaces the synced entry,
  because only you know whether you used a hint.
- **Lifetime solved counts** by difficulty and topic calibrate the plan: a
  hundred graph problems behind you means less time on graph basics.

Syncs run before each daily plan (at most every 10 minutes) and never block
planning if LeetCode is unreachable. Problems off LeetCode (practical tasks,
design interviews) still come from recaps and mock interviews.

## System design practice

A 23-problem design curriculum (URL shortener → rate limiter → distributed
cache → message queue → LLM inference API…) plus any design prompts the
company research found. Practise each as a mock interview: Claude plays the
company's interviewer at your level, probes one follow-up at a time, and on
finish grades the transcript on five dimensions (requirements, API & data model,
architecture, scaling, trade-offs). The result joins your history and spaced
repetition like any problem.

```bash
leetcode-coach design Design a Rate Limiter   # in the terminal; /finish to grade
```

Or click **Start mock interview** in the dashboard.

## Dashboard

```bash
leetcode-coach dashboard       # opens http://127.0.0.1:8765
```

One page for the whole loop: pick today's time and get a plan, write your
recap, see the full week-by-week plan to the interview (with every problem's
status), readiness, what the company asks and why, topic mastery against the
company's emphasis, and recent activity. Re-plan or refresh intel with a click.

It binds to `127.0.0.1` only, rejects non-localhost `Host` headers and
non-JSON POSTs, so nothing else on your network — or other sites in your
browser — can drive it.

### Demo mode (no API calls)

```bash
leetcode-coach dashboard --demo          # "midway": real intel + plan, simulated 12 days of practice
leetcode-coach dashboard --demo day1     # exactly the recorded live run
```

The demo content was generated by a real Claude run (Anthropic, mid-level,
interview 2026-12-25, including a real mock design interview) and lives in `coach/demo/`. Each launch copies a fresh scenario to
a temp folder, pins "today" to the scenario's date, and routes buttons to the
offline coach, so you can click through the whole UI without spending credits.
Rebuild the fixtures from a new live run with
`python scripts/make_demo.py <recorded-home>`. `LEETCODE_COACH_TODAY=YYYY-MM-DD`
pins the date for any run.

## Language (English / 中文)

The **中文 / EN** button at the bottom of the sidebar switches the whole
dashboard between English and Simplified Chinese, and the choice is saved.
With Chinese selected, Claude also writes plans, coach notes, company intel and
scorecard feedback in Chinese. **Mock interviews stay in English** on purpose,
because that's the language of the real interview. Problem titles, company round
names and technical terms (LRU, BFS, p99) stay in English everywhere. Content
already generated keeps the language it was written in.

Interface strings live in `coach/static/i18n.js` (both languages side by side);
server progress and error messages in `coach/i18n.py`.

## Model providers

| `LEETCODE_COACH_PROVIDER` | Needs | Web research |
|---|---|---|
| `anthropic` (default when `ANTHROPIC_API_KEY` is set) | API key or `ant auth login` | Yes |
| `bedrock` | AWS credentials, `AWS_REGION` | No — datasets only |
| `fake` | nothing | No — offline rules, for UI work and tests |

The model is `claude-opus-5-5` (override with `LEETCODE_COACH_MODEL`). On the
Claude API, requests opt into server-side refusal fallbacks.

## Tests

```bash
python -m unittest discover -s tests   # backend: offline, fake provider, no network

cd e2e && npm install                  # UI suite (Node 20, uses your installed Chrome)
npm test                               # 171 browser tests, desktop + mobile, ~41 s
npm run coverage                       # which UI code the tests ran / never ran
npm run test:update                    # accept intentional visual changes
npm run report                         # HTML report with traces of failures
```

The UI suite runs against the demo server (no credits) and mocks `/api/*`
from `e2e/fixtures/midway.json`, so every state is reachable:

| Spec | Covers |
|---|---|
| `states` | each panel empty / loading / error / populated / edge (long text, huge numbers, hostile HTML) |
| `interactions` | every control, busy and error states of every background job |
| `navigation` | sidebar highlight, jumps, landing flash, scroll and keyboard hand-off |
| `theme-a11y` | dark default, theme toggle, axe WCAG AA scans, Tab reachability + focus rings, hover/pressed/disabled, reduced motion |
| `visual` | pixel baselines per theme × viewport |
| `flows` | real backend round-trips and the API's request guards |
| `design` | interview loop, readiness by round, time split, level setup, every mock-interview state |
| `leetcode` | link / sync / unlink, validation, failures, synced-attempt labels |
| `i18n` | Chinese interface: no untranslated interface text, every key translated, switching + persistence, localised dates, axe, visual |
| `gaps` | paths the coverage report found untested |

`e2e/state-matrix.md` maps every region and control state to the test that covers it.

Any console error fails a test.

## Roadmap (beyond the MVP)

The architecture is built to grow into the full vision without a redesign:
personalized mistake analysis, concept-level mastery, adaptive spaced
repetition, mock interviews, and multiple/custom roadmaps. All of it builds on the same core idea — the AI observes your
history, knows where you are, and decides what you practice next.
