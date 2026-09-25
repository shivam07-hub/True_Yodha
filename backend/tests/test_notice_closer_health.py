"""The closer is a belt. A quiet digest must not look like a dead Action."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.services import notice_closer_health

NOW = datetime(2026, 9, 25, 7, 0, tzinfo=timezone.utc)


class _Result:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, rows, boom=False):
        self._rows, self._boom = rows, boom

    def select(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._boom:
            raise RuntimeError("PostgREST down")
        return _Result(self._rows)


class _FakeClient:
    def __init__(self, rows, boom=False):
        self._rows, self._boom = rows, boom

    def table(self, name):
        assert name == "notice_closer_heartbeat"
        return _FakeTable(self._rows, self._boom)


@pytest.fixture(autouse=True)
def _no_throttle():
    notice_closer_health.reset_cache()
    yield
    notice_closer_health.reset_cache()


def _check(monkeypatch, rows, *, boom=False, emitted=None):
    client = _FakeClient(rows, boom)
    monkeypatch.setattr(notice_closer_health, "get_supabase_admin", lambda: client)
    if emitted is not None:
        import app.notice as notice
        monkeypatch.setattr(notice, "observe", lambda sighting: emitted.append(sighting))
    return notice_closer_health.check_closer(NOW)


def _ran(hours_ago: float) -> list[dict]:
    return [{"ran_at": (NOW - timedelta(hours=hours_ago)).isoformat()}]


def test_no_heartbeat_yet_is_unknown_not_a_stall(monkeypatch) -> None:
    emitted: list = []
    health = _check(monkeypatch, [], emitted=emitted)
    assert health.state == "unknown"
    assert emitted == []


def test_a_run_inside_the_window_is_ok(monkeypatch) -> None:
    emitted: list = []
    health = _check(monkeypatch, _ran(5), emitted=emitted)
    assert health.state == "ok"
    assert health.stale_hours == pytest.approx(5, abs=0.1)
    assert emitted == []


def test_a_missed_day_opens_the_dead_man(monkeypatch) -> None:
    emitted: list = []
    health = _check(
        monkeypatch,
        _ran(settings.notice_closer_stale_hours + 1),
        emitted=emitted,
    )
    assert health.state == "stalled"
    assert [sighting.belt for sighting in emitted] == ["notice_closer"]


def test_heartbeat_migration_is_service_role_only() -> None:
    from pathlib import Path

    path = (
        Path(__file__).parents[2]
        / "database"
        / "migrations"
        / "20260925120000_notice_closer_heartbeat.sql"
    )
    sql = path.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS notice_closer_heartbeat" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "NOTIFY pgrst, 'reload schema'" in sql


def test_a_read_failure_is_unknown(monkeypatch) -> None:
    emitted: list = []
    health = _check(monkeypatch, [], boom=True, emitted=emitted)
    assert health.state == "unknown"
    assert emitted == []
