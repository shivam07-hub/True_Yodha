"""`/onboarding/result` is polled; its independent reads must not be sequential.

The onboarding result screen polls this endpoint every 2.5s for the whole CV
analysis (p50 48s / p90 109s in prod) and again for the whole shortlist run
(166-220s measured), so ONE onboarding costs 40-70 calls. Each call was a chain
of sequential Supabase round trips whose wall time was the SUM of reads that have
nothing to do with each other — the same disease already fixed in
`/home/bootstrap` and `/jobs/feed`.

Asserted with a `threading.Barrier` rather than a stopwatch: every read must
arrive at the barrier before any is allowed to return. Sequential code can never
satisfy that, so the test fails by TIMING OUT rather than by being slow — no
timing luck, no flake.

Falsify either test by replacing the `_parallel(...)` call it covers with
straight-line reads: the barrier times out and the test fails.
"""

from __future__ import annotations

import threading
from typing import Any

import pytest

from app.services import onboarding_service


_BARRIER_TIMEOUT = 5.0


class _Gate:
    """Passes only when `parties` callers are inside it at the same moment."""

    def __init__(self, parties: int) -> None:
        self._barrier = threading.Barrier(parties)
        self.timed_out = False

    def arrive(self) -> None:
        try:
            self._barrier.wait(timeout=_BARRIER_TIMEOUT)
        except threading.BrokenBarrierError:
            self.timed_out = True
            raise AssertionError(
                "reads did not overlap — they are running one after another"
            )


def test_the_journey_facts_are_read_at_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """state + profile + baseline are independent, and every poll needs all three."""
    gate = _Gate(3)

    class _State:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            gate.arrive()
            return {}

    class _Users:
        def get_profile(self, _user_id: str) -> dict[str, Any]:
            gate.arrive()
            return {}

    class _CV:
        def latest_baseline(self, _user_id: str) -> None:
            gate.arrive()
            return None

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _State())
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Users())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CV())

    result = onboarding_service._current_result(object(), "u1")

    # No baseline and no upload job → the first step, which is what a user polling
    # through the CV analysis sees on every one of those 20-50 calls.
    assert result["kind"] == "full_result_processing"
    assert result["journey_step"] == 1


def test_the_finished_screen_reads_are_taken_at_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """shortlist + credible match + proof skills share only the context hash, which
    is already computed. This is the branch polled for the whole shortlist run."""
    gate = _Gate(3)
    baseline = {"id": 7, "skills_confirmed_at": "2026-08-04T00:00:00+00:00"}
    profile = {"target_role_title": "Data Analyst", "target_seniority": "mid"}

    class _State:
        def get_state(self, _user_id: str) -> dict[str, Any]:
            return {}

    class _Users:
        def get_profile(self, _user_id: str) -> dict[str, Any]:
            return profile

        def list_user_skill_records(self, _user_id: str) -> list[Any]:
            gate.arrive()
            return []

    class _CV:
        def latest_baseline(self, _user_id: str) -> dict[str, Any]:
            return baseline

    class _Scores:
        def get_mirror_score(self, _user_id: str) -> dict[str, Any]:
            return {"total_score": 42.0}

    class _Jobs:
        def get_current_credible_match(self, *_a: Any, **_k: Any) -> None:
            gate.arrive()
            return None

    def _shortlist(*_a: Any, **_k: Any) -> tuple[list[Any], str]:
        gate.arrive()
        return [], "computing"

    monkeypatch.setattr(onboarding_service, "OnboardingRepository", lambda _db: _State())
    monkeypatch.setattr(onboarding_service, "UsersRepository", lambda _db: _Users())
    monkeypatch.setattr(onboarding_service, "CVVersionsRepository", lambda _db: _CV())
    monkeypatch.setattr(onboarding_service, "ScoresRepository", lambda _db: _Scores())
    monkeypatch.setattr(onboarding_service, "JobsRepository", lambda _db: _Jobs())
    monkeypatch.setattr(onboarding_service, "_shortlist", _shortlist)

    result = onboarding_service._current_result(object(), "u1")

    assert result["kind"] == "full_result_ready"
    assert result["shortlist_status"] == "computing"
    # The proof skills must come from the parallel read, not a fourth sequential one.
    assert result["skills"] == []
