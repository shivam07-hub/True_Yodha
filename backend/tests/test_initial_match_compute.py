"""Direction-save Match Run must not report Job OK after a timed-out read.

Rupanjana Mitra (2026-09-17 13:30 UTC): `initial_match` started, the candidate
pool read hit the 8s web PostgREST deadline (`The read operation timed out`),
`_trigger_initial_match_compute` swallowed it, and RQ logged Job OK. No retry.
The /market warmer then wrote ten rows, `compute_match_health` read them as
vetted, and `last_match_run_at` stayed null.
"""

from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

import pytest

from app.repositories import jobs as jobs_repo_mod
from app.services import cv_workflow
from app.services.background import TransientJobError


class _Repo:
    def clear_recommendations(self, _user_id: str) -> None:
        return None


def _wire(monkeypatch: pytest.MonkeyPatch, *, run_match: Any) -> dict[str, Any]:
    seen: dict[str, Any] = {"batch": 0, "web": 0, "drains": []}

    def _batch() -> object:
        seen["batch"] += 1
        return object()

    def _web() -> object:
        seen["web"] += 1
        return object()

    monkeypatch.setattr(cv_workflow, "get_supabase_admin_batch", _batch)
    monkeypatch.setattr(cv_workflow, "get_supabase_admin", _web)
    monkeypatch.setattr(jobs_repo_mod, "JobsRepository", lambda *_a, **_k: _Repo())
    monkeypatch.setattr(cv_workflow, "last_monday", lambda: date(2026, 9, 14))
    monkeypatch.setattr(cv_workflow.match_run, "run_match", run_match)
    from app.services.matching import feed_warm

    monkeypatch.setattr(
        feed_warm, "enqueue_feed_warm",
        lambda user_id, *, announce=False: seen["drains"].append((user_id, announce)) or True,
    )
    return seen


def test_a_timed_out_match_run_is_retried_not_job_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(*_a: Any, **_k: Any) -> None:
        raise TimeoutError("The read operation timed out")

    seen = _wire(monkeypatch, run_match=_boom)

    with pytest.raises(TimeoutError, match="timed out"):
        asyncio.run(cv_workflow._trigger_initial_match_compute("u1", force_context_refresh=True))

    assert seen["batch"] == 1
    assert seen["web"] == 0
    assert seen["drains"] == []  # a failed run starts no reading


def test_a_finished_run_starts_reading_the_rest_of_the_pool(monkeypatch: pytest.MonkeyPatch) -> None:
    """They saved a direction and left. The pool is read now, not on their next
    /market visit, and the bell tells them as rounds land."""
    async def _ok(*_a: Any, **_k: Any) -> None:
        return None

    seen = _wire(monkeypatch, run_match=_ok)
    asyncio.run(cv_workflow._trigger_initial_match_compute("u1", force_context_refresh=True))
    assert seen["drains"] == [("u1", True)]


def test_a_live_match_run_still_uses_the_batch_client(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ok(*_a: Any, **_k: Any) -> None:
        return None

    seen = _wire(monkeypatch, run_match=_ok)
    asyncio.run(cv_workflow._trigger_initial_match_compute("u1"))
    assert seen["batch"] == 1
    assert seen["web"] == 0


def test_transient_job_error_is_not_wrapped(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _retry(*_a: Any, **_k: Any) -> None:
        raise TransientJobError("provider")

    _wire(monkeypatch, run_match=_retry)
    with pytest.raises(TransientJobError, match="provider"):
        asyncio.run(cv_workflow._trigger_initial_match_compute("u1"))
