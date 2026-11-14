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
