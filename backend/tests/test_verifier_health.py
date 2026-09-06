from datetime import datetime, timedelta, timezone

import pytest

from app.services import verifier_health
from app.services.verifier_health import check_belt


class FakeDB:
    def __init__(self, value, *, productive=None, priority_due=0, raises=False):
        self.value = value
        self.productive = value if productive is None else productive
        self.priority_due = priority_due
        self.raises = raises
        self.reads = 0

    def rpc(self, name, params):
        assert name == "verifier_health_snapshot"
        assert params == {"p_priority_stale": "24 hours"}
        return self

    def execute(self):
        self.reads += 1
        if self.raises:
            raise RuntimeError("supabase down")
        data = {
            "last_attempt": self.value,
            "last_productive": self.productive,
            "priority_due": self.priority_due,
        }
        return type("Response", (), {"data": data})()


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
    _patch(monkeypatch, FakeDB(_ago(0.2), priority_due=9))

    belt = check_belt()

    assert belt.state == "ok"
    assert belt.stale_hours is not None and belt.stale_hours < 1
    assert belt.productive_stale_hours is not None and belt.productive_stale_hours < 1
    assert belt.priority_backlog == 9


def test_recent_claim_without_productive_verdict_is_degraded(monkeypatch, caplog):
    _patch(monkeypatch, FakeDB(_ago(0.2), productive=_ago(5), priority_due=12))

    with caplog.at_level("WARNING"):
        belt = check_belt()

    assert belt.state == "degraded"
    assert belt.priority_backlog == 12
    assert "reason=no_recent_productive_verdict" in caplog.text


def test_silent_belt_alerts(monkeypatch, caplog):
    """Four days of silence went unnoticed in prod — this is the guard."""
    _patch(monkeypatch, FakeDB(_ago(96)))

    with caplog.at_level("WARNING"):
        belt = check_belt()

    assert belt.state == "stalled"
    assert "job_verifier.alert reason=dead_man" in caplog.text


def test_silent_belt_opens_a_dead_man_notice(monkeypatch):
    from app.notice import NoticeBook, bind, unbind

    book = NoticeBook.testing()
    bind(book)
    _patch(monkeypatch, FakeDB(_ago(96)))
    try:
        assert check_belt().state == "stalled"
        rows = book.snapshot()
        assert len(rows) == 1
        assert rows[0].cause_key == "dead_man:listing_verifier"
    finally:
        unbind()


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
