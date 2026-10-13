"""Background judging spends only while the person is on Myro (Shivam, 2026-10-14).

Of 501 drain ticks on 2026-10-13, 500 queued themselves; the OpenRouter balance
ran out that evening. A drain now asks `presence` before queuing its next batch.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.services import presence
from app.services.matching import feed_warm


@pytest.fixture
def enqueued(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    seen: list[dict[str, Any]] = []
    monkeypatch.setattr(feed_warm.background, "enqueue", lambda _lane, _job, **kw: seen.append(kw["payload"]))
    monkeypatch.setattr(presence.settings, "redis_url", "")
    presence._LOCAL.clear()
    return seen


def test_a_drain_continues_while_the_person_is_here(enqueued: list[dict[str, Any]]) -> None:
    presence.mark("u-here")
    feed_warm._continue_drain("u-here", 7, announce=True)
    assert enqueued == [{"user_id": "u-here", "baseline_version_id": 7, "announce": True}]


def test_a_drain_pauses_when_they_have_gone(enqueued: list[dict[str, Any]], monkeypatch: pytest.MonkeyPatch) -> None:
    presence.mark("u-gone")
    monkeypatch.setattr(presence.time, "monotonic", lambda: 10**12)  # far past the window
    feed_warm._continue_drain("u-gone", 7, announce=True)
    feed_warm._continue_drain("u-never-seen", 7, announce=False)
    assert enqueued == []


def test_a_deploy_killed_tick_does_not_restart_a_drain_for_someone_who_left(enqueued: list[dict[str, Any]]) -> None:
    import asyncio

    asyncio.run(feed_warm._feed_warm_failed({"_abandoned": True, "user_id": "u-gone", "baseline_version_id": 7}))
    assert enqueued == []


def test_unknown_presence_reads_as_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    """Redis unreachable: the rule exists to stop spend, so not knowing means not spending."""
    monkeypatch.setattr(presence.settings, "redis_url", "redis://127.0.0.1:1")
    assert presence.is_present("anyone") is False
    presence.mark("anyone")  # and marking never raises into the page


def test_the_shell_read_marks_the_person_present() -> None:
    """`/users/me` is read by the shell on every authed page — the one door the
    whole cohort walks — so it is where presence is written."""
    import inspect

    from app.routers import users

    assert "presence.mark(principal.id)" in inspect.getsource(users.get_me)
