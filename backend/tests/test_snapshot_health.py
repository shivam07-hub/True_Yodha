"""The Tier-0 snapshot dead-man. A refresh that keeps failing cannot say so.

role_families last succeeded 2026-09-07; skill_closeness and company_pulse never
had. 126 failed attempts between them were written to `snapshot_refresh_state`
and nothing read the table for 26 days.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.notice.fingerprint import cause_key_for
from app.services import snapshot_health
from app.services.probe import SNAPSHOT_TASKS, open_notice, snapshot_belt

NOW = datetime(2026, 10, 4, 8, 0, tzinfo=timezone.utc)
MIGRATIONS = Path(__file__).parents[2] / "database" / "migrations"


class _Result:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, rows, boom=False):
        self._rows, self._boom = rows, boom

    def select(self, *_a, **_k):
        return self

    def execute(self):
        if self._boom:
            raise RuntimeError("PostgREST down")
        return _Result(self._rows)


class _FakeClient:
    def __init__(self, rows, boom=False):
        self._rows, self._boom = rows, boom

    def table(self, name):
        assert name == "snapshot_refresh_state"
        return _FakeTable(self._rows, self._boom)


@pytest.fixture(autouse=True)
def _no_throttle():
    snapshot_health.reset_cache()
    yield
    snapshot_health.reset_cache()


def _check(monkeypatch, rows, *, boom=False):
    emitted: list = []
    client = _FakeClient(rows, boom)
    monkeypatch.setattr(snapshot_health, "get_supabase_admin", lambda: client)
    import app.notice as notice

    monkeypatch.setattr(notice, "observe", lambda sighting: emitted.append(sighting))
    health = snapshot_health.check_snapshots(NOW)
    for task in health.stalled:
        open_notice(snapshot_belt(task), "stalled")
    return health, {cause_key_for(sighting) for sighting in emitted}


def _ago(hours: float) -> str:
    return (NOW - timedelta(hours=hours)).isoformat()


def test_the_belts_are_the_tables_tasks() -> None:
    """A task the table holds but the declarations do not name would open as
    `dead_man:unknown` — loud, but nameless. Keep the two lists one list."""
    latest = sorted(
        path
        for path in MIGRATIONS.glob("*.sql")
        if "add constraint snapshot_refresh_state_task_check" in path.read_text()
    )[-1]
    sql = latest.read_text().split("add constraint snapshot_refresh_state_task_check")[1]
    tasks = set(re.findall(r"'([a-z_]+)'", sql.split(";")[0]))
    assert tasks == set(SNAPSHOT_TASKS)


def test_the_september_state_opens_one_notice_per_dead_task(monkeypatch) -> None:
    health, keys = _check(
        monkeypatch,
        [
            {"task": "role_families", "last_success_at": "2026-09-07T19:52:21+00:00"},
            {"task": "skill_closeness", "last_success_at": None},
            {"task": "company_pulse", "last_success_at": None},
            {"task": "job_search", "last_success_at": _ago(12)},
            {"task": "analytics", "last_success_at": _ago(26)},
        ],
    )
    assert health.state == "stalled"
    assert health.stalled == ["company_pulse", "role_families", "skill_closeness"]
    assert keys == {
        "dead_man:snapshot.role_families",
        "dead_man:snapshot.skill_closeness",
        "dead_man:snapshot.company_pulse",
    }


def test_one_missed_day_is_not_a_stall(monkeypatch) -> None:
    """A daily refresh comes due after 20h. One failed day leaves it ~44h old,
    and the hourly retry is still running — not yet a Notice."""
    health, keys = _check(
        monkeypatch,
        [
            {"task": "role_families", "last_success_at": _ago(44)},
            {"task": "skill_demand", "last_success_at": _ago(1)},
        ],
    )
    assert health.state == "ok"
    assert health.stalled == []
    assert keys == set()


def test_two_missed_days_is(monkeypatch) -> None:
    health, keys = _check(
        monkeypatch, [{"task": "company_pulse", "last_success_at": _ago(49)}]
    )
    assert health.state == "stalled"
    assert keys == {"dead_man:snapshot.company_pulse"}


def test_a_failed_read_is_unknown_and_opens_nothing(monkeypatch) -> None:
    health, keys = _check(monkeypatch, [], boom=True)
    assert health.state == "unknown"
    assert keys == set()


def test_an_empty_table_is_unknown(monkeypatch) -> None:
    health, keys = _check(monkeypatch, [])
    assert health.state == "unknown"
    assert keys == set()


def test_a_task_nobody_declared_still_opens(monkeypatch) -> None:
    health, keys = _check(
        monkeypatch, [{"task": "brand_new_snapshot", "last_success_at": None}]
    )
    assert health.stalled == ["brand_new_snapshot"]
    assert keys == {"dead_man:unknown"}
