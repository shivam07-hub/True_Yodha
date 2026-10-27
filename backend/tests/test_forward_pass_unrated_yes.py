"""A Yes the judge never rated is rated when its owner next arrives.

The north star counts a Yes on a job the judge rated at least 3.5 (DECISIONS
APPLY1). On 2026-10-27, 4 of the 7 real Yeses had never been rated — sent before
a save or a first Yes queued the judge — so they could never count, and an
absent rating is not a verdict. Brought forward on `/users/me`, one person at a
time, never by a sweep.
"""
from __future__ import annotations

from typing import Any

import pytest

from app.services import application_yes, forward_pass


@pytest.fixture
def wired(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    state: dict[str, Any] = {"claims": [], "enqueued": [], "unrated": ["j1", "j2"]}

    def _claim(key: str, _ttl: int) -> bool:
        state["claims"].append(key)
        return state["claims"].count(key) == 1

    monkeypatch.setattr(forward_pass.debounce, "claim", _claim)

    from app import database
    from app.services.matching import on_demand

    monkeypatch.setattr(database, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(
        application_yes, "unrated_yes_job_ids", lambda _db, _uid: list(state["unrated"])
    )
    monkeypatch.setattr(
        on_demand, "enqueue_job_eval", lambda uid, jid: state["enqueued"].append((uid, jid))
    )
    return state


def test_every_unrated_yes_is_queued_for_the_judge(wired: dict[str, Any]) -> None:
    assert forward_pass.judge_unrated_yeses("u1") == 2
    assert wired["enqueued"] == [("u1", "j1"), ("u1", "j2")]


def test_one_claim_per_person_per_day(wired: dict[str, Any]) -> None:
    forward_pass.judge_unrated_yeses("u1")
    assert forward_pass.judge_unrated_yeses("u1") == 0
    assert len(wired["enqueued"]) == 2


def test_nothing_unrated_queues_nothing(wired: dict[str, Any]) -> None:
    wired["unrated"] = []
    assert forward_pass.judge_unrated_yeses("u1") == 0
    assert wired["enqueued"] == []


def test_a_failed_check_never_fails_the_read(
    wired: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(_db: Any, _uid: str) -> list[str]:
        raise RuntimeError("data api down")

    monkeypatch.setattr(application_yes, "unrated_yes_job_ids", _boom)
    assert forward_pass.judge_unrated_yeses("u1") == 0


def test_the_shell_read_runs_it_whatever_the_list_passes_do(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """It rates single jobs and rebuilds no list, so the list passes' early
    returns must not swallow it."""
    ran: list[str] = []
    monkeypatch.setattr(forward_pass, "judge_unrated_yeses", lambda uid: ran.append(uid) or 0)
    monkeypatch.setattr(forward_pass, "_promote_catch_all_primary", lambda *_a: True)

    forward_pass.on_profile_read("u1", {})

    assert ran == ["u1"]
