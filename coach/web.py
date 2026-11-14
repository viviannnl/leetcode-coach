"""Local web dashboard.

A small Flask app serving one page plus a JSON API over :class:`coach.Coach`.

Security posture — this is a single-user tool on your own machine:
  - Binds to 127.0.0.1 only (never all interfaces), so nothing else on the
    network can reach it.
  - Rejects requests whose Host header isn't localhost, which blocks
    DNS-rebinding attacks from web pages you visit.
  - Every state-changing endpoint is POST and requires a JSON body, which a
    cross-site form can't send without a CORS preflight this app never grants.
    That stops other sites from triggering (paid) model calls via your browser.

Model calls can take a minute or more (web research, campaign planning), so
they run as background jobs the page polls.
"""

from __future__ import annotations

import threading
import uuid
import webbrowser
from pathlib import Path
from typing import Any, Callable

from flask import Flask, abort, jsonify, request, send_from_directory

from . import leetcode, llm
from .coach import Coach
from .store import Store

_STATIC = Path(__file__).parent / "static"
_ALLOWED_HOSTS = {"127.0.0.1", "localhost"}


class Jobs:
    """Tiny in-process job runner for slow model calls."""

    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        # One model-backed job at a time: they all write the same state files.
        self._run_lock = threading.Lock()

    def start(self, kind: str, fn: Callable[[Callable[[str], None]], Any]) -> str:
        job_id = uuid.uuid4().hex[:12]
        with self._lock:
            self._jobs[job_id] = {"id": job_id, "kind": kind, "status": "running", "message": "Starting…"}

        def progress(msg: str) -> None:
            with self._lock:
                self._jobs[job_id]["message"] = msg

        def run() -> None:
            with self._run_lock:
                try:
                    result = fn(progress)
                    update = {"status": "done", "result": result}
                except (llm.LLMError, leetcode.LeetCodeError, RuntimeError, ValueError) as exc:
                    update = {"status": "error", "error": str(exc)}
                except Exception as exc:  # pragma: no cover - surfaced to UI
                    update = {"status": "error", "error": f"Unexpected error: {exc}"}
            with self._lock:
                self._jobs[job_id].update(update)

        threading.Thread(target=run, daemon=True).start()
        return job_id

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None


def create_app(state_path: Path | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    store = Store(state_path)
    jobs = Jobs()

    def coach() -> Coach:
        # A fresh Coach per request so "today" rolls over at midnight.
        return Coach(store=store)

    @app.before_request
    def _guard() -> None:
        host = (request.host or "").rsplit(":", 1)[0].strip("[]")
        if host not in _ALLOWED_HOSTS:
            abort(403)
        if request.method == "POST" and not request.is_json:
            abort(415)

    @app.after_request
    def _headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
            "connect-src 'self'; frame-ancestors 'none'"
        )
        return resp

    def body() -> dict[str, Any]:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    @app.get("/")
    def index():
        return send_from_directory(_STATIC, "index.html")

    @app.get("/static/<path:name>")
    def static_files(name: str):
        return send_from_directory(_STATIC, name)

    @app.get("/api/dashboard")
    def api_dashboard():
        return jsonify(coach().dashboard())

    @app.post("/api/target")
    def api_target():
        data = body()
        company = str(data.get("company", "")).strip()
        if not company:
            return jsonify({"error": "Company is required."}), 400
        try:
            c = coach()
            if not c.is_initialized():
                c.initialize("neetcode-150")
            posting = data.get("job_posting")
            if isinstance(posting, str) and len(posting) > 20000:
                return jsonify({"error": "That job posting is very long — paste just the description."}), 400
            c.set_target(
                company,
                data.get("interview_date") or None,
                data.get("daily_minutes"),
                level=data.get("level") or None,
                role=data.get("role") or None,
                job_posting=posting if isinstance(posting, str) else None,
            )
        except ValueError as exc:
            msg = str(exc) if "level" in str(exc) else "Interview date must look like 2026-12-25."
            return jsonify({"error": msg}), 400
        return jsonify({"ok": True})

    @app.post("/api/research")
    def api_research():
        return jsonify({"job": jobs.start("research", lambda p: _summary(coach().refresh_company(p)))})

    @app.post("/api/campaign")
    def api_campaign():
        return jsonify({"job": jobs.start("campaign", lambda p: bool(coach().generate_campaign(p)))})

    @app.post("/api/plan")
    def api_plan():
        try:
            minutes = int(body().get("minutes", 0))
        except (TypeError, ValueError):
            minutes = 0
        if not 5 <= minutes <= 600:
            return jsonify({"error": "Minutes should be between 5 and 600."}), 400

        def run(progress):
            progress(f"Planning your best {minutes} minutes…")
            coach().plan_today(minutes)
            return True

        return jsonify({"job": jobs.start("plan", run)})

    @app.post("/api/feedback")
    def api_feedback():
        text = str(body().get("text", "")).strip()
        if not text:
            return jsonify({"error": "Tell the coach how it went first."}), 400
        if len(text) > 5000:
            return jsonify({"error": "That recap is very long — trim it under 5,000 characters."}), 400

        def run(progress):
            progress("Reading your recap and updating your history…")
            return coach().record_feedback(text)

        return jsonify({"job": jobs.start("feedback", run)})

    # ---- system design sessions ------------------------------------------ #

    def _session_payload(sess):
        return {k: sess[k] for k in ("id", "title", "topic", "difficulty", "concepts", "status", "started", "hints", "transcript", "scorecard", "minutes") if k in sess}

    @app.post("/api/design/start")
    def api_design_start():
        title = str(body().get("title", "")).strip()
        if not title:
            return jsonify({"error": "Pick a design problem."}), 400
        return jsonify({"job": jobs.start("design", lambda p: _session_payload(coach().start_design_session(title, p)))})

    @app.post("/api/design/reply")
    def api_design_reply():
        data = body()
        sid, text = str(data.get("session", "")), str(data.get("text", "")).strip()
        if not text:
            return jsonify({"error": "Write your answer first."}), 400
        if len(text) > 8000:
            return jsonify({"error": "That answer is very long — split it into a few messages."}), 400
        return jsonify({"job": jobs.start("design", lambda p: _session_payload(coach().reply_design_session(sid, text, p)))})

    @app.post("/api/design/finish")
    def api_design_finish():
        sid = str(body().get("session", ""))
        return jsonify({"job": jobs.start("design", lambda p: _session_payload(coach().finish_design_session(sid, p)))})

    @app.post("/api/design/abandon")
    def api_design_abandon():
        try:
            coach().abandon_design_session(str(body().get("session", "")))
        except (RuntimeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify({"ok": True})

    # ---- LeetCode profile ------------------------------------------------ #

    @app.post("/api/leetcode")
    def api_leetcode_link():
        username = str(body().get("username", "")).strip().lstrip("@")
        if not leetcode.valid_username(username):
            return jsonify({"error": "That doesn't look like a LeetCode username (letters, digits, - and _)."}), 400
        return jsonify({"job": jobs.start("leetcode", lambda p: coach().link_leetcode(username, p))})

    @app.post("/api/leetcode/sync")
    def api_leetcode_sync():
        return jsonify({"job": jobs.start("leetcode", lambda p: coach().sync_leetcode(p))})

    @app.post("/api/leetcode/unlink")
    def api_leetcode_unlink():
        coach().unlink_leetcode()
        return jsonify({"ok": True})

    @app.get("/api/jobs/<job_id>")
    def api_job(job_id: str):
        job = jobs.get(job_id)
        if job is None:
            return jsonify({"error": "Unknown job."}), 404
        return jsonify(job)

    return app


def _summary(profile: dict[str, Any]) -> dict[str, Any]:
    return {"problems": len(profile["problems"]), "web_status": profile["web_status"]}


def serve(state_path: Path | None = None, port: int = 8765, open_browser: bool = True) -> None:
    app = create_app(state_path)
    url = f"http://127.0.0.1:{port}/"
    print(f"LeetCode Coach dashboard → {url}  (local only; Ctrl+C to stop)")
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    # Loopback only — see module docstring.
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
