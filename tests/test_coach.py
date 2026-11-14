"""Offline tests: fake LLM provider, no network.

Run with:  python -m unittest discover -s tests
"""

from __future__ import annotations

import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

os.environ["LEETCODE_COACH_PROVIDER"] = "fake"

from coach import companies  # noqa: E402
from coach.coach import Coach  # noqa: E402
from coach.roadmap import load_roadmap, norm_title  # noqa: E402
from coach.store import Store  # noqa: E402

DATASET = [
    {"title": "Web Crawler Multithreaded", "url": "https://leetcode.com/problems/web-crawler-multithreaded",
     "difficulty": "Medium", "frequency": 100.0, "recency": "three-months", "tags": [], "datasets": ["x"]},
    {"title": "LRU Cache", "url": "https://leetcode.com/problems/lru-cache",
     "difficulty": "Medium", "frequency": 60.0, "recency": "all", "tags": ["Design"], "datasets": ["x"]},
]
TODAY = date(2026, 11, 13)


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "state.json")
        self.coach = Coach(store=self.store, today=TODAY)
        self.coach.initialize("neetcode-150")
        patcher = mock.patch.object(companies, "fetch_datasets", return_value=(DATASET, []))
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)


class TestRoadmap(unittest.TestCase):
    def test_title_matching_ignores_punctuation(self) -> None:
        rm = load_roadmap("neetcode-150")
        self.assertIsNotNone(rm.by_title("Two Sum II - Input Array Is Sorted"))
        self.assertEqual(norm_title("Two Sum II - Input"), norm_title("two sum ii input"))

    def test_extras_append_without_duplicates(self) -> None:
        rm = load_roadmap("neetcode-150")
        ext = rm.with_extras([
            {"title": "LRU Cache", "topic": "Linked List", "difficulty": "Medium"},  # already on roadmap
            {"title": "Web Crawler", "topic": "Graphs", "difficulty": "Medium"},
        ])
        self.assertEqual(len(ext.problems), len(rm.problems) + 1)
        self.assertEqual(ext.by_title("web crawler").source, "company")
        self.assertEqual(ext.by_title("LRU Cache").source, "roadmap")


class TestPipeline(Base):
    def test_target_research_campaign_plan_feedback(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25", 60)
        profile = self.coach.refresh_company()
        titles = [p["title"] for p in profile["problems"]]
        self.assertIn("Web Crawler Multithreaded", titles)
        lru = next(p for p in profile["problems"] if p["title"] == "LRU Cache")
        self.assertTrue(lru["in_roadmap"])

        campaign = self.coach.generate_campaign()
        self.assertEqual(campaign["weeks"][0]["start"], "2026-11-13")
        self.assertEqual(campaign["weeks"][-1]["end"], "2026-12-25")

        plan = self.coach.plan_today(45)
        self.assertTrue(plan.items)
        self.assertLessEqual(plan.total_minutes, 45)

        first = plan.items[0].title
        result = self.coach.record_feedback(f"{first} took 10 min, easy.")
        self.assertEqual([a["title"] for a in result["applied"]], [first])

        dash = self.coach.dashboard()
        self.assertEqual(dash["target"]["days_left"], 42)
        self.assertIn("readiness", dash)
        self.assertEqual(len(dash["campaign"]["weeks"]), len(campaign["weeks"]))
        self.assertEqual(dash["today_plan"]["minutes"], 45)

    def test_changing_company_drops_campaign(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25")
        self.coach.refresh_company()
        self.coach.generate_campaign()
        self.coach.set_target("Anthropic", "2026-12-20")  # same company: keep (marked stale)
        self.assertIsNotNone(self.coach.load_campaign())
        self.assertTrue(self.coach.dashboard()["campaign"]["stale"])
        self.coach.set_target("OpenAI", "2026-12-20")
        self.assertIsNone(self.coach.load_campaign())

    def test_campaign_needs_future_date(self) -> None:
        self.coach.set_target("Anthropic", "2026-11-01")
        with self.assertRaises(RuntimeError):
            self.coach.generate_campaign()


class TestLevelsAndRounds(Base):
    def test_level_is_stored_and_validated(self) -> None:
        t = self.coach.set_target("Anthropic", "2026-12-25", level="senior", role="Software Engineer, Infra")
        self.assertEqual((t.level, t.level_label, t.role), ("senior", "Senior", "Software Engineer, Infra"))
        with self.assertRaises(ValueError):
            self.coach.set_target("Anthropic", level="principal-wizard")

    def test_level_change_needs_new_research_and_plan(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25", level="new_grad")
        self.coach.refresh_company()
        self.coach.generate_campaign()
        self.assertFalse(self.coach.needs_research())
        self.coach.set_target("Anthropic", "2026-12-25", level="senior")
        self.assertTrue(self.coach.needs_research())
        self.assertIsNone(self.coach.load_campaign())
        self.assertTrue(self.coach.dashboard()["company"]["stale_level"])

    def test_rounds_follow_level_and_weights_sum_to_one(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25", level="new_grad")
        junior = self.coach.refresh_company()["rounds"]
        self.assertNotIn("system_design", {r["track"] for r in junior})
        self.coach.set_target("Anthropic", "2026-12-25", level="senior")
        senior = self.coach.refresh_company()["rounds"]
        self.assertIn("system_design", {r["track"] for r in senior})
        for rounds in (junior, senior):
            self.assertAlmostEqual(sum(r["weight"] for r in rounds), 1.0, places=2)

    def test_readiness_reports_untracked_rounds(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25", level="senior")
        self.coach.refresh_company()
        r = self.coach.dashboard()["readiness"]
        behavioral = [x for x in r["rounds"] if x["track"] == "behavioral"]
        self.assertTrue(behavioral and behavioral[0]["score"] is None)
        self.assertGreater(r["untracked_weight"], 0)

    def test_campaign_allocates_time_by_track(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25", level="senior")
        self.coach.refresh_company()
        weeks = self.coach.generate_campaign()["weeks"]
        tracks = {a["track"] for w in weeks for a in w["allocation"]}
        self.assertIn("system_design", tracks)


class TestDesignSessions(Base):
    def setUp(self) -> None:
        super().setUp()
        self.coach.set_target("Anthropic", "2026-12-25", level="senior")

    def test_full_session_records_an_attempt(self) -> None:
        s = self.coach.start_design_session("design a rate limiter")
        self.assertEqual(s["title"], "Design a Rate Limiter")
        self.assertEqual(s["transcript"][0]["role"], "interviewer")
        s = self.coach.reply_design_session(s["id"], "Requirements: 10k QPS. Token bucket in a sharded cache, replicas, trade-off latency vs consistency.")
        self.assertEqual([m["role"] for m in s["transcript"]], ["interviewer", "candidate", "interviewer"])
        done = self.coach.finish_design_session(s["id"])
        self.assertEqual(done["status"], "finished")
        self.assertEqual(len(done["scorecard"]["scores"]), 5)
        rec = self.store.load().records["Design a Rate Limiter"]
        self.assertEqual(rec.attempts[-1].outcome, done["scorecard"]["outcome"])
        self.assertIsNone(self.coach.active_design_session())
        self.assertEqual(self.coach.dashboard()["design_scorecards"][0]["title"], "Design a Rate Limiter")

    def test_hints_are_counted(self) -> None:
        s = self.coach.start_design_session("Design a URL Shortener")
        s = self.coach.reply_design_session(s["id"], "I'm stuck, not sure where to start")
        self.assertEqual(s["hints"], 1)

    def test_guards(self) -> None:
        with self.assertRaises(RuntimeError):
            self.coach.start_design_session("Two Sum")  # not a design problem
        s = self.coach.start_design_session("Design a URL Shortener")
        self.assertEqual(self.coach.start_design_session("Design a URL Shortener")["id"], s["id"])  # resumes
        with self.assertRaises(RuntimeError):
            self.coach.start_design_session("Design a Chat System")  # one at a time
        with self.assertRaises(RuntimeError):
            self.coach.finish_design_session(s["id"])  # no answer yet
        with self.assertRaises(ValueError):
            self.coach.load_design_session("../../etc/passwd")
        self.coach.abandon_design_session(s["id"])
        self.assertIsNone(self.coach.active_design_session())


class TestLeetCodeSync(Base):
    PROFILE = {
        "username": "vivian",
        "solved": {"All": 120, "Easy": 60, "Medium": 55, "Hard": 5},
        "tags": [{"tag": "Array", "solved": 70}, {"tag": "Hash Table", "solved": 40}],
        "recent": [
            {"title": "Two Sum", "slug": "two-sum", "timestamp": 1763000000, "date": "2026-11-13"},
            {"title": "Two Sum II - Input Array Is Sorted", "slug": "two-sum-ii-input-array-is-sorted", "timestamp": 1763050000, "date": "2026-11-13"},
            {"title": "Some Obscure Puzzle", "slug": "some-obscure-puzzle", "timestamp": 1763060000, "date": "2026-11-13"},
        ],
    }

    def setUp(self) -> None:
        super().setUp()
        from coach import leetcode
        self.lc = leetcode
        p = mock.patch.object(leetcode, "fetch_profile", return_value=self.PROFILE)
        self.fetch = p.start()
        self.addCleanup(p.stop)

    def test_link_logs_roadmap_solves_and_reports_others(self) -> None:
        res = self.coach.link_leetcode("@vivian")
        self.assertEqual(res["added"], ["Two Sum", "Two Sum II Input Array Is Sorted"])  # matched despite punctuation
        self.assertEqual(res["other"], ["Some Obscure Puzzle"])
        rec = self.store.load().records["Two Sum"]
        self.assertEqual((rec.attempts[0].source, rec.attempts[0].outcome), ("leetcode", "solved_independently"))
        self.assertIsNotNone(rec.next_review)
        self.assertEqual(self.coach.dashboard()["leetcode"]["solved"]["All"], 120)

    def test_resync_does_not_duplicate(self) -> None:
        self.coach.link_leetcode("vivian")
        res = self.coach.sync_leetcode()
        self.assertEqual(res["added"], [])
        self.assertEqual(len(self.store.load().records["Two Sum"].attempts), 1)

    def test_recap_replaces_same_day_synced_attempt(self) -> None:
        coach = Coach(store=self.store, today=date(2026, 11, 13))
        coach.link_leetcode("vivian")
        coach.record_feedback("Two Sum took 20 min, I needed a hint.")
        rec = self.store.load().records["Two Sum"]
        self.assertEqual(len(rec.attempts), 1)
        self.assertEqual(rec.attempts[0].outcome, "solved_with_hints")
        self.assertEqual(rec.attempts[0].source, "")

    def test_bad_username_and_unlink(self) -> None:
        with self.assertRaises(ValueError):
            self.coach.link_leetcode("not a name!")
        self.coach.link_leetcode("vivian")
        self.coach.unlink_leetcode()
        self.assertIsNone(self.coach.dashboard()["leetcode"])
        self.assertIn("Two Sum", self.store.load().records)  # history stays

    def test_planning_syncs_with_cooldown_and_survives_failure(self) -> None:
        self.coach.link_leetcode("vivian")
        self.fetch.reset_mock()
        self.coach.plan_today(30)
        self.fetch.assert_not_called()  # synced moments ago
        state = self.store.load()
        state.leetcode["synced_at"] = "2020-01-01T00:00:00"
        self.store.save(state)
        self.fetch.side_effect = self.lc.LeetCodeError("down")
        plan = self.coach.plan_today(30)  # LeetCode down must not block planning
        self.assertTrue(plan.items)
        ctx = self.coach._build_plan_context(*self.coach._require_state(), 30)
        self.assertEqual(ctx["leetcode_profile"]["solved"]["All"], 120)


class TestReadiness(Base):
    def test_mastery_raises_readiness(self) -> None:
        self.coach.set_target("Anthropic", "2026-12-25")
        self.coach.refresh_company()
        before = self.coach.dashboard()["readiness"]["overall"]
        self.coach.record_feedback("Web Crawler Multithreaded took 30 min, solved it.")
        after = self.coach.dashboard()["readiness"]
        self.assertGreater(after["overall"], before)
        self.assertGreater(after["problem_coverage"], 0)


class TestWeb(Base):
    def setUp(self) -> None:
        super().setUp()
        from coach.web import create_app

        self.client = create_app(self.store.path).test_client()

    def test_rejects_foreign_host(self) -> None:
        r = self.client.get("/api/dashboard", headers={"Host": "evil.example"})
        self.assertEqual(r.status_code, 403)

    def test_post_requires_json(self) -> None:
        r = self.client.post("/api/plan", data={"minutes": "30"}, headers={"Host": "127.0.0.1:8765"})
        self.assertEqual(r.status_code, 415)

    def test_dashboard_and_target(self) -> None:
        h = {"Host": "127.0.0.1:8765"}
        r = self.client.post("/api/target", json={"company": "Anthropic", "interview_date": "2026-12-25"}, headers=h)
        self.assertEqual(r.status_code, 200)
        r = self.client.post("/api/target", json={"company": "Anthropic", "interview_date": "Dec 25"}, headers=h)
        self.assertEqual(r.status_code, 400)
        r = self.client.get("/api/dashboard", headers=h)
        self.assertEqual(r.get_json()["target"]["company"], "Anthropic")
        self.assertIn("Content-Security-Policy", r.headers)


if __name__ == "__main__":
    unittest.main()
