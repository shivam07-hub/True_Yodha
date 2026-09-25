"""The forward pass that finishes a Match Run a Direction save never landed.

Deveshwar Kashyap (2026-09-19): saved a direction, the worker logged `Job OK`
twice and wrote nothing, and every surface afterwards read the ten rows the
/market warmer had written as if a run had happened. 331 profiles hold a
direction newer than their last run. They are brought forward one at a time,
on the `/users/me` read they already make.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.services import forward_pass

NOW = datetime(2026, 9, 25, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def enqueued(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    claims: list[str] = []

    def _claim(key: str, ttl: int) -> bool:
        claims.append(key)
        return key not in claims[:-1]

    monkeypatch.setattr(forward_pass.debounce, "claim", _claim)

    from app.services import background

    monkeypatch.setattr(
        background,
        "enqueue",
        lambda lane, job_type, *, payload, correlation_id=None, **_k: calls.append(
            {
                "lane": lane,
                "job_type": job_type,
                "payload": payload,
                "correlation_id": correlation_id,
            }
        ),
    )
    return calls


def _profile(**overrides: Any) -> dict[str, Any]:
    base = {
        "target_role_titles": ["Marketing Strategy and Techniques"],
        "target_updated_at": (NOW - timedelta(days=6)).isoformat(),
        "last_match_run_at": (NOW - timedelta(days=80)).isoformat(),
    }
    base.update(overrides)
    return base


def test_an_outstanding_run_is_enqueued(enqueued: list[dict[str, Any]]) -> None:
    assert forward_pass.finish_outstanding_match("u1", _profile()) is True
    assert enqueued == [
        {
            "lane": "fast",
            "job_type": "initial_match",
            "payload": {"user_id": "u1", "force_context_refresh": True},
            "correlation_id": "target-match:u1",
        }
    ]


def test_the_run_is_forced_so_it_cannot_cache_hit(enqueued: list[dict[str, Any]]) -> None:
    """Without force, the compute's own cache gate answers `cache_hit`, which
    stamps nothing — the same user would return here forever."""
    forward_pass.finish_outstanding_match("u1", _profile())
    assert enqueued[0]["payload"]["force_context_refresh"] is True


def test_a_covered_user_pays_nothing(enqueued: list[dict[str, Any]]) -> None:
    profile = _profile(last_match_run_at=(NOW - timedelta(days=1)).isoformat())
    assert forward_pass.finish_outstanding_match("u1", profile) is False
    assert enqueued == []


def test_a_run_in_flight_is_left_alone(enqueued: list[dict[str, Any]]) -> None:
    profile = _profile(
        target_updated_at=(datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat(),
        last_match_run_at=None,
    )
    assert forward_pass.finish_outstanding_match("u1", profile) is False
    assert enqueued == []


def test_a_legacy_profile_is_never_swept(enqueued: list[dict[str, Any]]) -> None:
    """No change stamp means we cannot tell. Starting a run for every dormant
    account is the backfill this platform does not do."""
    profile = _profile(target_updated_at=None, last_match_run_at=None)
    assert forward_pass.finish_outstanding_match("u1", profile) is False
    assert enqueued == []


def test_the_claim_is_per_direction_change(enqueued: list[dict[str, Any]]) -> None:
    """A second visit on the same direction costs one Redis op. A NEW direction
    that also failed is owed its own run — a claim keyed on the user alone
    would swallow it for a day."""
    profile = _profile()
    assert forward_pass.finish_outstanding_match("u1", profile) is True
    assert forward_pass.finish_outstanding_match("u1", profile) is False
    assert len(enqueued) == 1

    moved = _profile(target_updated_at=(NOW - timedelta(days=5)).isoformat())
    assert forward_pass.finish_outstanding_match("u1", moved) is True
    assert len(enqueued) == 2


def test_an_enqueue_failure_never_breaks_the_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(forward_pass.debounce, "claim", lambda key, ttl: True)
    from app.services import background

    def _boom(*_a: Any, **_k: Any) -> None:
        raise RuntimeError("redis down")

    monkeypatch.setattr(background, "enqueue", _boom)
    assert forward_pass.finish_outstanding_match("u1", _profile()) is False


def test_the_promote_pass_still_short_circuits_the_profile_read(
    monkeypatch: pytest.MonkeyPatch, enqueued: list[dict[str, Any]]
) -> None:
    """`save_target` enqueues a run of its own, so the two passes never queue the
    same work twice on one read."""
    monkeypatch.setattr(forward_pass, "_promote_catch_all_primary", lambda *_a, **_k: True)
    forward_pass.on_profile_read("u1", _profile())
    assert enqueued == []
