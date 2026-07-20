from datetime import datetime, timedelta, timezone

import pytest

from app.services import verifier_health
from app.services.verifier_health import check_belt


class FakeDB:
    def __init__(self, value, *, raises=False):
        self.value = value
        self.raises = raises
        self.reads = 0

    def rpc(self, name, params):
        assert name == "verifier_last_attempt"
        return self

    def execute(self):
        self.reads += 1
        if self.raises:
            raise RuntimeError("supabase down")
        return type("Response", (), {"data": self.value})()


@pytest.fixture(autouse=True)
def _clear_cache():
    verifier_health.reset_cache()
    yield
    verifier_health.reset_cache()


def _patch(monkeypatch, db):
    monkeypatch.setattr(verifier_health, "get_supabase_admin", lambda: db)
    return db


def _ago(hours: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def test_recent_claim_reads_healthy(monkeypatch):
    _patch(monkeypatch, FakeDB(_ago(0.2)))

    belt = check_belt()

    assert belt.state == "ok"
    assert belt.stale_hours is not None and belt.stale_hours < 1


def test_silent_belt_alerts(monkeypatch, caplog):
    """Four days of silence went unnoticed in prod — this is the guard."""
    _patch(monkeypatch, FakeDB(_ago(96)))

    with caplog.at_level("WARNING"):
        belt = check_belt()

    assert belt.state == "stalled"
    assert "job_verifier.alert reason=dead_man" in caplog.text


def test_never_ran_is_alerted_not_silently_ok(monkeypatch, caplog):
    _patch(monkeypatch, FakeDB(None))

    with caplog.at_level("WARNING"):
        belt = check_belt()

    assert belt.state == "stalled"
    assert "reason=never_ran" in caplog.text


def test_unreadable_heartbeat_is_unknown_not_a_false_alarm(monkeypatch):
    _patch(monkeypatch, FakeDB(None, raises=True))

    belt = check_belt()

    assert belt.state == "unknown"
    assert belt.stale_hours is None


def test_check_is_throttled_so_probe_frequency_never_drives_db_load(monkeypatch):
    db = _patch(monkeypatch, FakeDB(_ago(0.1)))
    now = datetime.now(timezone.utc)

    check_belt(now)
    check_belt(now + timedelta(minutes=1))
    check_belt(now + timedelta(minutes=4))
    assert db.reads == 1

    check_belt(now + timedelta(minutes=6))
    assert db.reads == 2
