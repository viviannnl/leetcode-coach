"""Command-line interface for the AI Daily LeetCode Coach.

The whole product answers one question — "what should I practice today?" — so
the CLI is intentionally tiny:

    leetcode-coach init          choose a roadmap (once)
    leetcode-coach plan          "I have 45 minutes" -> today's plan
    leetcode-coach done          tell the coach how it went (plain English)
    leetcode-coach progress      a quick look at where you are
    leetcode-coach target        aim at a company + interview date
    leetcode-coach research      refresh what that company asks (datasets + web)
    leetcode-coach campaign      the full week-by-week plan to the interview
    leetcode-coach dashboard     open the visual dashboard in your browser

`plan` then `done` is the whole daily loop.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from . import llm
from .coach import Coach, Plan
from .roadmap import available_roadmaps, load_roadmap
from .store import LEVELS, Store, default_state_path

# --- small terminal helpers ------------------------------------------------ #

_USE_COLOR = sys.stdout.isatty()


def _c(text: str, code: str) -> str:
    if not _USE_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def bold(t: str) -> str:
    return _c(t, "1")


def dim(t: str) -> str:
    return _c(t, "2")


def green(t: str) -> str:
    return _c(t, "32")


def cyan(t: str) -> str:
    return _c(t, "36")


def yellow(t: str) -> str:
    return _c(t, "33")


def _parse_minutes(tokens: list[str]) -> int | None:
    """Accept things like '45', '45m', '1h', '1 hour', 'I have 90 minutes'."""
    text = " ".join(tokens).lower()
    hours = re.search(r"(\d+)\s*(?:h|hour|hours)", text)
    mins = re.search(r"(\d+)\s*(?:m|min|mins|minute|minutes)", text)
    total = 0
    if hours:
        total += int(hours.group(1)) * 60
    if mins:
        total += int(mins.group(1))
    if total:
        return total
    bare = re.search(r"\b(\d+)\b", text)
    if bare:
        return int(bare.group(1))
    return None


# --- commands -------------------------------------------------------------- #


def cmd_init(args: argparse.Namespace) -> int:
    coach = Coach(store=Store(args.state))
    roadmaps = available_roadmaps()

    roadmap_id = args.roadmap
    if roadmap_id is None:
        if len(roadmaps) == 1:
            roadmap_id = roadmaps[0]
        else:
            print(bold("Choose a roadmap:"))
            for i, rid in enumerate(roadmaps, 1):
                rm = load_roadmap(rid)
                print(f"  {i}. {rm.name}  {dim('(' + str(len(rm.problems)) + ' problems)')}")
            choice = input("> ").strip()
            try:
                roadmap_id = roadmaps[int(choice) - 1]
            except (ValueError, IndexError):
                roadmap_id = choice  # allow typing the id directly

    try:
        rm = coach.initialize(roadmap_id)
    except FileNotFoundError as exc:
        print(yellow(str(exc)))
        return 1

    print()
    print(green(f"✓ Coaching you through {bold(rm.name)}."))
    print(dim(f"  {len(rm.problems)} problems across {len(rm.topics())} topics."))
    print()
    print("Tomorrow (or now), just tell me how much time you have:")
    print(cyan("    leetcode-coach plan 45"))
    return 0


def cmd_plan(args: argparse.Namespace) -> int:
    store = Store(args.state)
    coach = Coach(store=store)
    if not coach.is_initialized():
        print(yellow("No roadmap yet. Run `leetcode-coach init` first."))
        return 1

    minutes = _parse_minutes(args.time)
    if minutes is None:
        print(yellow("How much time do you have? e.g. `leetcode-coach plan 45`"))
        return 1
    if minutes <= 0:
        print(yellow("That's no time at all — come back when you've got a few minutes!"))
        return 1

    print(dim(f"Thinking about your best {minutes} minutes today..."))
    try:
        plan = coach.plan_today(minutes)
    except llm.LLMError as exc:
        print(yellow(f"\n{exc}"))
        return 2

    _render_plan(plan, minutes)
    return 0


def _render_plan(plan: Plan, minutes: int) -> None:
    print()
    if plan.coach_note:
        print(bold(plan.coach_note))
        print()
    if not plan.items:
        print(dim("Nothing to practice right now — enjoy the break."))
        return

    focus_label = {"new": "new material", "review": "review", "balanced": "a mix of new & review"}
    print(dim(f"Focus: {focus_label.get(plan.focus, plan.focus)}"))
    print()
    for i, item in enumerate(plan.items, 1):
        tag = green("review") if item.kind == "review" else cyan("new")
        print(f"  {bold(str(i) + '.')} {bold(item.title)}  [{tag}]")
        print(
            dim(
                f"     {item.topic} · {item.difficulty} · ~{item.estimated_minutes} min"
            )
        )
        if item.reason:
            print(dim(f"     {item.reason}"))
    print()
    print(dim(f"Estimated total: ~{plan.total_minutes} of your {minutes} minutes."))
    print()
    print("When you're done, tell me how it went:")
    print(cyan('    leetcode-coach done "..."'))


def cmd_done(args: argparse.Namespace) -> int:
    store = Store(args.state)
    coach = Coach(store=store)
    if not coach.is_initialized():
        print(yellow("No roadmap yet. Run `leetcode-coach init` first."))
        return 1

    feedback = " ".join(args.feedback).strip()
    if not feedback:
        print("Tell me how today's practice went (just type it out):")
        try:
            feedback = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 1
    if not feedback:
        print(yellow("Nothing to record."))
        return 1

    plan = coach.load_plan()
    print(dim("Updating your history..."))
    try:
        result = coach.record_feedback(feedback, plan=plan)
    except llm.LLMError as exc:
        print(yellow(f"\n{exc}"))
        return 2

    _render_feedback(result)
    return 0


def _render_feedback(result: dict) -> None:
    print()
    applied = result.get("applied", [])
    if applied:
        print(bold("Recorded:"))
        for a in applied:
            outcome = a["outcome"].replace("_", " ")
            nxt = a.get("next_review")
            when = dim(f"  → review around {nxt}") if nxt else ""
            print(f"  {green('✓')} {a['title']}  {dim('(' + outcome + ')')}{when}")
        print()
    if result.get("coach_note"):
        print(result["coach_note"])
        print()
    unmatched = result.get("unmatched", [])
    if unmatched:
        print(yellow("Couldn't match these to roadmap problems:"))
        for u in unmatched:
            print(f"  · {u}")
        print()
    if not applied and not unmatched:
        print(dim("Nothing to record from that."))


def cmd_progress(args: argparse.Namespace) -> int:
    coach = Coach(store=Store(args.state))
    if not coach.is_initialized():
        print(yellow("No roadmap yet. Run `leetcode-coach init` first."))
        return 1

    p = coach.progress()
    print()
    print(bold(p["roadmap"]))
    pct = (p["solved"] / p["total"] * 100) if p["total"] else 0
    print(f"  Solved: {green(str(p['solved']))}/{p['total']}  ({pct:.0f}%)")
    print(f"  Attempted: {p['attempted']}/{p['total']}")
    if p["due_reviews"]:
        print(f"  Reviews due: {yellow(str(p['due_reviews']))}")
    t = p.get("target")
    if t:
        when = f", {t['days_left']} days to go" if t.get("days_left") is not None else ""
        print(f"  Target: {bold(t['company'])}{when} · readiness {cyan(str(t['readiness']) + '%')}")
        if t["weak_spots"]:
            print(dim(f"  Weak spots: {', '.join(t['weak_spots'])}"))
    print()
    print(dim("By topic:"))
    for t in p["by_topic"]:
        if t["solved"] == 0:
            continue
        bar = _bar(t["solved"], t["total"])
        print(f"  {bar}  {t['topic']}  {dim(str(t['solved']) + '/' + str(t['total']))}")
    print()
    return 0


def cmd_target(args: argparse.Namespace) -> int:
    coach = Coach(store=Store(args.state))
    if args.clear:
        coach.clear_target()
        print(green("✓ Target cleared. Back to the plain roadmap."))
        return 0
    if not args.company:
        state = coach.store.load()
        if state.target:
            print(f"Target: {bold(state.target.company)}  interview {state.target.interview_date or '(no date)'}")
        else:
            print(dim("No target yet. e.g. `leetcode-coach target Anthropic --date 2026-12-25`"))
        return 0
    try:
        posting = Path(args.posting).read_text() if args.posting else None
        t = coach.set_target(" ".join(args.company), args.date, args.minutes, level=args.level, role=args.role, job_posting=posting)
    except ValueError as exc:
        print(yellow(str(exc) if "level" in str(exc) else "Dates look like 2026-12-25."))
        return 1
    except OSError as exc:
        print(yellow(f"Couldn't read the job posting: {exc}"))
        return 1
    print(green(f"✓ Preparing you for {bold(t.company)}, {t.level_label} {t.role}" + (f", on {t.interview_date}." if t.interview_date else ".")))
    print("Next, learn what they ask:")
    print(cyan("    leetcode-coach research"))
    return 0


def cmd_research(args: argparse.Namespace) -> int:
    coach = Coach(store=Store(args.state))
    try:
        profile = coach.refresh_company(progress=lambda m: print(dim(m)))
    except (RuntimeError, llm.LLMError) as exc:
        print(yellow(str(exc)))
        return 2
    print()
    print(bold(f"{profile['company']} — {len(profile['problems'])} problems to know"))
    print(dim(f"  datasets: {profile['dataset_count']} rows · web: {profile['web_status']}"))
    if profile["interview_format"]:
        print()
        print(profile["interview_format"])
    print()
    for p in profile["problems"][:12]:
        tag = cyan("practical") if p["kind"] == "practical" else dim(p["difficulty"])
        print(f"  {_bar(round(p['weight'] * 10), 10, 10)}  {p['title']}  [{tag}]  {dim(p['topic'])}")
    print()
    print("Now build the full plan to your interview:")
    print(cyan("    leetcode-coach campaign"))
    return 0


def cmd_campaign(args: argparse.Namespace) -> int:
    coach = Coach(store=Store(args.state))
    campaign = None if args.regenerate else coach.load_campaign()
    if campaign is None:
        try:
            campaign = coach.generate_campaign(progress=lambda m: print(dim(m)))
        except (RuntimeError, llm.LLMError) as exc:
            print(yellow(str(exc)))
            return 2
    print()
    print(bold(campaign["summary"]))
    print()
    for i, w in enumerate(campaign["weeks"], 1):
        print(f"  {bold('Week ' + str(i))}  {dim(w['start'] + ' → ' + w['end'])}  {w['theme']}")
        titles = ", ".join(p["title"] for p in w["problems"])
        print(dim(f"     {titles}"))
    print()
    return 0


def cmd_design(args: argparse.Namespace) -> int:
    """Run a mock system design interview in the terminal."""
    coach = Coach(store=Store(args.state))
    title = " ".join(args.title)
    try:
        sess = coach.active_design_session() if not title else coach.start_design_session(title, progress=lambda m: print(dim(m)))
        if sess is None:
            print(yellow("No active session. e.g. `leetcode-coach design Design a Rate Limiter`"))
            return 1
        for m in sess["transcript"]:
            who = cyan("Interviewer") if m["role"] == "interviewer" else bold("You")
            print(f"\n{who}: {m['text']}")
        print(dim("\nType your answer (blank line to send). Commands: /finish, /quit"))
        while True:
            lines: list[str] = []
            try:
                while True:
                    line = input("> " if not lines else "  ")
                    if not line and lines:
                        break
                    if line.strip() in ("/finish", "/quit"):
                        lines = [line.strip()]
                        break
                    lines.append(line)
            except (EOFError, KeyboardInterrupt):
                print(dim("\nPaused. Resume with `leetcode-coach design`."))
                return 0
            text = "\n".join(lines).strip()
            if text == "/quit":
                print(dim("Paused. Resume with `leetcode-coach design`."))
                return 0
            if text == "/finish":
                done = coach.finish_design_session(sess["id"], progress=lambda m: print(dim(m)))
                card = done["scorecard"]
                print()
                for sc in card["scores"]:
                    print(f"  {_bar(sc['score'], 4, 8)}  {sc['dimension']}  {dim(sc['note'])}")
                print(f"\n{card['summary']}")
                if card.get("weak_concepts"):
                    print(yellow("Revisit: " + ", ".join(card["weak_concepts"])))
                print(dim(f"Next review around {card.get('next_review')}."))
                return 0
            if not text:
                continue
            sess = coach.reply_design_session(sess["id"], text, progress=lambda m: print(dim(m)))
            print(f"\n{cyan('Interviewer')}: {sess['transcript'][-1]['text']}")
    except (RuntimeError, ValueError, llm.LLMError) as exc:
        print(yellow(str(exc)))
        return 2


def cmd_leetcode(args: argparse.Namespace) -> int:
    """Link a public LeetCode profile, or sync the linked one."""
    from . import leetcode

    coach = Coach(store=Store(args.state))
    try:
        if args.unlink:
            coach.unlink_leetcode()
            print(green("✓ LeetCode account unlinked. Logged history stays."))
            return 0
        progress = lambda m: print(dim(m))  # noqa: E731
        res = coach.link_leetcode(args.username, progress) if args.username else coach.sync_leetcode(progress)
    except (leetcode.LeetCodeError, RuntimeError, ValueError) as exc:
        print(yellow(str(exc)))
        return 2
    s = res["solved"]
    print(green(f"✓ @{res['username']}: {s['All']} solved ({s['Easy']} easy · {s['Medium']} medium · {s['Hard']} hard)"))
    if res["added"]:
        print("Logged from your recent accepted submissions:")
        for t in res["added"]:
            print(f"  {green('✓')} {t}")
    else:
        print(dim("No new roadmap problems in your recent submissions."))
    if res["other"]:
        print(dim(f"Also solved (not on your plan): {', '.join(res['other'][:6])}"))
    return 0


def cmd_dashboard(args: argparse.Namespace) -> int:
    from .web import serve

    state = args.state
    if args.demo:
        state = _prepare_demo(args.demo)
        if state is None:
            return 1
    serve(state_path=state, port=args.port, open_browser=not args.no_browser)
    return 0


def _prepare_demo(scenario: str) -> Path | None:
    """Copy a recorded scenario to a throwaway home and pin the environment.

    Demo content was generated by a real run, so the UI shows real intel and
    plans. Buttons go to the offline fake coach: no API calls, no credits.
    Every launch starts from the pristine fixture.
    """
    import os
    import shutil
    import tempfile

    src = Path(__file__).parent / "demo" / scenario
    if not src.is_dir():
        choices = sorted(p.name for p in (Path(__file__).parent / "demo").iterdir() if p.is_dir())
        print(yellow(f"Unknown demo {scenario!r}. Choose from: {', '.join(choices)}"))
        return None
    meta = json.loads((src / "demo.json").read_text())
    home = Path(tempfile.mkdtemp(prefix=f"lc-demo-{scenario}-"))
    shutil.copytree(src, home, dirs_exist_ok=True)
    os.environ["LEETCODE_COACH_PROVIDER"] = "fake"
    os.environ["LEETCODE_COACH_TODAY"] = meta["today"]
    os.environ["LEETCODE_COACH_DEMO"] = meta["label"]
    print(dim(f"Demo '{scenario}' — {meta['label']}, today pinned to {meta['today']}. No API calls."))
    return home / "state.json"


def _bar(done: int, total: int, width: int = 12) -> str:
    filled = round(done / total * width) if total else 0
    return green("█" * filled) + dim("░" * (width - filled))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="leetcode-coach",
        description="An AI coach that decides what you should practice each day.",
    )
    parser.add_argument(
        "--state",
        type=Path,
        default=None,
        help=f"Path to state file (default: {default_state_path()}).",
    )
    sub = parser.add_subparsers(dest="command")

    p_init = sub.add_parser("init", help="Choose a roadmap (do this once).")
    p_init.add_argument("roadmap", nargs="?", help="Roadmap id (e.g. neetcode-150).")
    p_init.set_defaults(func=cmd_init)

    p_plan = sub.add_parser("plan", help='Get today\'s plan, e.g. `plan 45`.')
    p_plan.add_argument("time", nargs="*", help="How much time you have, e.g. 45 or '1 hour'.")
    p_plan.set_defaults(func=cmd_plan)

    p_done = sub.add_parser("done", help="Tell the coach how the session went.")
    p_done.add_argument("feedback", nargs="*", help="Plain-English recap of your session.")
    p_done.set_defaults(func=cmd_done)

    p_prog = sub.add_parser("progress", help="See where you are on the roadmap.")
    p_prog.set_defaults(func=cmd_progress)

    p_tgt = sub.add_parser("target", help="Aim at a company, e.g. `target Anthropic --date 2026-12-25`.")
    p_tgt.add_argument("company", nargs="*", help="Company name.")
    p_tgt.add_argument("--date", help="Interview date (YYYY-MM-DD).")
    p_tgt.add_argument("--minutes", type=int, help="Typical minutes per day you can practise.")
    p_tgt.add_argument("--level", choices=list(LEVELS), help="Target level (default: mid).")
    p_tgt.add_argument("--role", help='Role title, e.g. "Software Engineer, Infrastructure".')
    p_tgt.add_argument("--posting", help="Path to a text file with the job posting.")
    p_tgt.add_argument("--clear", action="store_true", help="Remove the target.")
    p_tgt.set_defaults(func=cmd_target)

    p_res = sub.add_parser("research", help="Refresh what your target company asks.")
    p_res.set_defaults(func=cmd_research)

    p_camp = sub.add_parser("campaign", help="Show the full plan to your interview.")
    p_camp.add_argument("--regenerate", action="store_true", help="Re-plan from today.")
    p_camp.set_defaults(func=cmd_campaign)

    p_des = sub.add_parser("design", help="Mock system design interview, e.g. `design Design a Rate Limiter`.")
    p_des.add_argument("title", nargs="*", help="Design problem title (omit to resume).")
    p_des.set_defaults(func=cmd_design)

    p_lc = sub.add_parser("leetcode", help="Link your public LeetCode profile (`leetcode <username>`) or sync it.")
    p_lc.add_argument("username", nargs="?", help="LeetCode username (omit to sync the linked one).")
    p_lc.add_argument("--unlink", action="store_true", help="Stop syncing (keeps logged history).")
    p_lc.set_defaults(func=cmd_leetcode)

    p_dash = sub.add_parser("dashboard", help="Open the visual dashboard (localhost only).")
    p_dash.add_argument("--port", type=int, default=8765)
    p_dash.add_argument("--no-browser", action="store_true")
    p_dash.add_argument(
        "--demo", nargs="?", const="midway", metavar="SCENARIO",
        help="Recorded demo data, no API calls (midway | day1; default midway).",
    )
    p_dash.set_defaults(func=cmd_dashboard)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    # Pick up a saved API key from the coach home so nobody has to export it.
    home = (args.state or default_state_path()).parent
    warning = llm.load_saved_key(home)
    if warning:
        print(yellow(warning))
    if not getattr(args, "command", None):
        parser.print_help()
        return 0
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
