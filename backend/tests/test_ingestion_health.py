"""Ingestion is a belt, and a stopped belt cannot report its own absence.

On 2026-09-18 the last `job_source_runs` row was nine days old, one job had been
ingested in that time, and 2,715 had been retired in six. Every instrument said
fine: the listing verifier ran 31,380 checks on the 16th and reported healthy,
because it was healthy — it was busily retiring listings from a corpus nothing
was refilling. It surfaced because someone audited one user's matches by hand.

Two thresholds on purpose. 72h is the cadence we are aiming for and is measured
but quiet; 168h is what compute can hold today and is the only one that opens a
Notice. Both are env-tunable so tightening is a config change.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.services import ingestion_health

NOW = datetime(2026, 9, 18, 12, 0, tzinfo=timezone.utc)


class _Result:
    def __init__(self, data): self.data = data


class _FakeTable:
    def __init__(self, rows, boom=False):
        self._rows, self._boom = rows, boom

    def select(self, *_a, **_k): return self
    def order(self, *_a, **_k): return self
    def limit(self, *_a, **_k): return self

    def execute(self):
        if self._boom:
            raise RuntimeError("PostgREST down")
        return _Result(self._rows)


class _FakeClient:
    def __init__(self, rows, boom=False):
        self._rows, self._boom = rows, boom
        self.tables: list[str] = []

    def table(self, name):
        self.tables.append(name)
        return _FakeTable(self._rows, self._boom)


@pytest.fixture(autouse=True)
def _no_throttle():
    ingestion_health.reset_cache()
    yield
    ingestion_health.reset_cache()


def _check(monkeypatch, rows, *, boom=False, now=NOW, emitted=None):
    client = _FakeClient(rows, boom)
    monkeypatch.setattr(ingestion_health, "get_supabase_admin", lambda: client)
    if emitted is not None:
        import app.notice as notice
        monkeypatch.setattr(notice, "observe", lambda s: emitted.append(s))
    return ingestion_health.check_ingestion(now), client


def _ran(hours_ago: float) -> list[dict]:
    return [{"started_at": (NOW - timedelta(hours=hours_ago)).isoformat()}]


def test_a_recent_run_is_ok(monkeypatch) -> None:
    health, _ = _check(monkeypatch, _ran(4))
    assert health.state == "ok"
    assert health.stale_hours == pytest.approx(4, abs=0.1)


def test_past_the_target_cadence_is_degraded_and_quiet(monkeypatch) -> None:
    emitted: list = []
    health, _ = _check(monkeypatch, _ran(settings.ingestion_degraded_hours + 1), emitted=emitted)
    assert health.state == "degraded"
    # Measured, never mailed: we know we are behind 72h and a permanently open
    # row is a row nobody reads.
    assert emitted == []


def test_the_nine_day_outage_is_stalled_and_opens_a_notice(monkeypatch) -> None:
    emitted: list = []
    health, _ = _check(monkeypatch, _ran(9 * 24), emitted=emitted)
    assert health.state == "stalled"
    assert [s.belt for s in emitted] == ["job_ingestion"]


def test_a_belt_that_never_ran_is_stalled_not_ok(monkeypatch) -> None:
    # An unstarted belt and a dead one look identical to a user staring at a
    # corpus that never grows.
    health, _ = _check(monkeypatch, [])
    assert health.state == "stalled"
    assert health.stale_hours is None


def test_an_unreadable_heartbeat_is_unknown_never_a_false_alarm(monkeypatch) -> None:
    health, _ = _check(monkeypatch, [], boom=True)
    assert health.state == "unknown"


def test_it_reads_the_scrapers_own_heartbeat_not_ingested_at(monkeypatch) -> None:
    # The extension writes `jobs.ingested_at` when a user saves a job, and
    # exactly one such save landed during the outage. A single user saving a
    # LinkedIn post must never make a dead scraper look alive.
    _health, client = _check(monkeypatch, _ran(1))
    assert client.tables == ["job_source_runs"]


def test_the_thresholds_are_env_tunable(monkeypatch) -> None:
    monkeypatch.setattr(settings, "ingestion_stalled_hours", 72)
    monkeypatch.setattr(settings, "ingestion_degraded_hours", 24)
    health, _ = _check(monkeypatch, _ran(80), emitted=[])
    assert health.state == "stalled"


def test_the_read_is_throttled(monkeypatch) -> None:
    client = _FakeClient(_ran(1))
    monkeypatch.setattr(ingestion_health, "get_supabase_admin", lambda: client)
    for _ in range(5):
        ingestion_health.check_ingestion(NOW)
    assert len(client.tables) == 1, "a health probe must not drive one DB read per request"
