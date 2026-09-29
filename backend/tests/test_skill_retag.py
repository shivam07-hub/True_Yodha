"""The CV re-tag may not mark an edit scored when nothing scored it.

2026-09-28: a Main CV edit's extraction returned unparseable JSON. The re-tag
fell through to `recompute_score` over the OLD skills and stamped
`recompute_finished_at`, so the client stopped waiting on a score that never
read the edit.
"""
from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import cv_skill_edit
from app.services.background import TransientJobError


class _Table:
    def __init__(self, log: list[str]) -> None:
        self._log = log

    def update(self, _patch: dict[str, Any]) -> "_Table":
        return self

    def eq(self, _col: str, value: Any) -> "_Table":
        self._log.append(f"stamp:{value}")
        return self

    def execute(self) -> None:
        return None


class _CVRepo:
    def __init__(self, log: list[str]) -> None:
        self.client = type("C", (), {"table": lambda _s, _n: _Table(log)})()


def _wire(monkeypatch: pytest.MonkeyPatch, parsed: dict[str, Any]) -> list[str]:
    log: list[str] = []

    async def _parse(_text: str) -> dict[str, Any]:
        return parsed

    monkeypatch.setattr(cv_skill_edit.cv_parser, "parse_cv_text", _parse)
    monkeypatch.setattr(
        cv_skill_edit.scoring, "record_cv_score",
        lambda *_a, **_k: log.append("record"),
    )
    monkeypatch.setattr(
        cv_skill_edit.scoring, "recompute_score",
        lambda *_a, **_k: log.append("recompute"),
    )
    return log


def _run(log: list[str], *, allow_retry: bool) -> None:
    asyncio.run(cv_skill_edit.run_async_retag(
        _CVRepo(log), object(), "u1", 475, "cv text", allow_retry=allow_retry,  # type: ignore[arg-type]
    ))


def test_a_failed_read_is_retried_and_claims_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    log = _wire(monkeypatch, {"skills_detected": [], "provider_failed": True})
    with pytest.raises(TransientJobError):
        _run(log, allow_retry=True)
    assert log == []  # no score from stale skills, no "finished"


def test_with_no_retry_the_wait_stops_and_the_score_is_left_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    log = _wire(monkeypatch, {"skills_detected": [], "provider_failed": True})
    _run(log, allow_retry=False)
    assert log == ["stamp:475"]


def test_a_read_edit_is_scored_then_stamped(monkeypatch: pytest.MonkeyPatch) -> None:
    log = _wire(monkeypatch, {"skills_detected": [{"skill": "SQL"}], "provider_failed": False})
    _run(log, allow_retry=True)
    assert log == ["record", "stamp:475"]


def test_exhausted_retries_stop_the_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    log: list[str] = []
    monkeypatch.setattr(cv_skill_edit, "CVVersionsRepository", lambda _db: _CVRepo(log))
    monkeypatch.setattr(cv_skill_edit, "get_supabase_admin", lambda: object())
    asyncio.run(cv_skill_edit._skill_retag_exhausted({"baseline_id": 475}))
    assert log == ["stamp:475"]
