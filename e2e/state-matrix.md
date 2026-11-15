# UI state matrix — LeetCode Coach dashboard

Each cell names the covering test (`spec › test`), or `n/a` with a reason.

## Regions

| Region | Populated | Empty | Loading | Error | Edge |
|---|---|---|---|---|---|
| Dashboard (whole) | states › renders every panel | states › no target → setup | states › slow load skeleton; fast load no flash | states › failure + retry; gaps › error without message | states › long titles; big numbers; hostile text; missing fields |
| Today | states › renders every panel | states › no plan → time picker; zero items | interactions › planning busy | interactions › job failure toast | gaps › less common render branches |
| Plan (campaign) | interactions › weeks toggle; segments | states › no campaign; no date | gaps › re-plan success | gaps › re-plan failure | states › stale campaign |
| Time split (allocation) | design › week shows time split | design › no allocation on old campaigns | n/a (static) | n/a | design › split labels sum to week |
| Readiness by round | design › tracked rounds + untracked line | states › no intel → gather | n/a (part of dashboard load) | n/a | design › all rounds untracked |
| Interview loop | design › loop lists every round with track | design › old profile without rounds | n/a | n/a | design › stale level note |
| Intel problems | interactions › show all / fewer | gaps › intel with no problems | interactions › refresh runs research | gaps › research failure | design › design prompt has Practice button |
| Design session | design › transcript + phase + concepts | design › none → panel absent | design › reply busy locks composer | design › reply failure toast | design › hostile transcript text |
| Scorecard | design › finish shows rubric | design › dismiss removes it | design › finish busy | design › finish failure | design › reopen from Activity |
| LeetCode profile | leetcode › linked stats | leetcode › unlinked form | leetcode › link busy | leetcode › unknown profile; sync failure; gaps › unlink failure | leetcode › sync time formats |
| Topics | interactions › topics show all | n/a (roadmap always has topics) | n/a | n/a | states › big numbers |
| Activity | states › renders every panel | states › no activity | n/a | n/a | design › mock interviews list |

## Controls

| Control | Effect + request | Hover | Pressed | Focus | Disabled | Busy | Failure |
|---|---|---|---|---|---|---|---|
| Minute picker | interactions › presets/custom sync | theme-a11y › hover feedback (shared .seg) | n/a | theme-a11y › Tab walk | n/a | n/a | gaps › out-of-range |
| Plan my session / Re-plan today | interactions › request body | theme-a11y › primary states | theme-a11y › primary states | Tab walk | interactions › locks | interactions › busy | interactions › failure |
| Record session (+ ⌘↵) | interactions › recap via ⌘↵ | primary states | primary states | Tab walk | interactions › empty recap | theme-a11y › busy cursor | n/a (mocked success) |
| Start mock interview | design › start from Today | Tab walk | n/a | Tab walk | design › disabled while another session | design › start busy | design › start failure |
| Send answer (+ ⌘↵) | design › reply request body | n/a | n/a | Tab walk | design › empty answer | design › reply busy | design › reply failure |
| Finish & score | design › finish | n/a | n/a | Tab walk | design › disabled before first answer | design › finish busy | design › finish failure |
| Abandon (two-step) | design › abandon confirm / cancel / Escape | n/a | n/a | Tab walk | n/a | n/a | n/a |
| Week toggle | interactions › weeks toggle | theme-a11y › hover | n/a | theme-a11y › keyboard | n/a | n/a | n/a |
| Sidebar links | navigation › each item | theme-a11y › hover | n/a | Tab walk | n/a | n/a | n/a |
| Setup form (level, role, posting) | design › setup sends level/role/posting | n/a | n/a | Tab walk | n/a | interactions › setup chain | interactions › server validation |
| Link / Sync / Unlink LeetCode | leetcode › link request body; sync; unlink | n/a | n/a | Tab walk | leetcode › invalid username | leetcode › link busy | leetcode › failures |
| Language toggle | i18n › switching: instant, saved, survives reload | theme-a11y › hover (shared .btn) | n/a | Tab walk | n/a | n/a | i18n › failed save |
| Theme toggle | theme-a11y › toggle persists | theme-a11y › hover | n/a | Tab walk | n/a | n/a | n/a |

## Cross-cutting

| Concern | Test |
|---|---|
| Default theme (both OS settings) | theme-a11y › dark by default |
| axe: each theme, each screen, expanded, session, scorecard | theme-a11y › accessibility; design › session a11y |
| Keyboard reachability + focus rings | theme-a11y › Tab walk |
| Reduced motion | theme-a11y › reduced motion |
| Small screens | every `@responsive` spec |
| Visual baselines | visual › dashboard, panels, session, scorecard |
| Chinese interface (every screen) | i18n › no untranslated text; every key translated; visual; axe |
| Strict console | fixtures.ts |
| Coverage | `npm run coverage` |
