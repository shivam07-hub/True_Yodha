"""The inflow sweep — the heal that does not wait for a surface to be visited.

Prod, 2026-09-12: three banked gap answers pending since 2026-07-14. They were
enqueued correctly and the job died; the only heal (`retry_stale_ingests`) runs
on the Stories-tab read, and the user who answered them never went back.
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services import career_reservoir, reservoir_ingest_sweep

_NOW = datetime(2026, 9, 12, 12, 0, tzinfo=timezone.utc)


def _entry(entry_id: str, *, minutes_old: int, attempts: int = 0, user: str = "u1") -> dict[str, Any]:
    return {
        "id": entry_id,
        "user_id": user,
        "created_at": (_NOW - timedelta(minutes=minutes_old)).isoformat(),
        "payload": {"sweep_attempts": attempts} if attempts else {},
    }


class _FakeRepo:
    """Answers the cutoff the way Postgres would, so the test proves the sweep
    asks for the right window rather than filtering in Python afterwards."""

    def __init__(self, entries: list[dict[str, Any]]) -> None:
        self.entries = entries
        self.payload_writes: list[tuple[str, dict[str, Any]]] = []
        self.skipped: list[tuple[str, str]] = []
        self.asked_cutoff: str | None = None

    def stale_pending_inflows(self, older_than_iso: str, limit: int = 200):
        self.asked_cutoff = older_than_iso
        return [e for e in self.entries if e["created_at"] < older_than_iso][:limit]

    def set_entry_payload(self, user_id: str, entry_id: str, payload: dict[str, Any]) -> None:
        self.payload_writes.append((entry_id, payload))

    def mark_skipped(self, user_id: str, entry_id: str, payload, reason: str) -> None:
        self.skipped.append((entry_id, reason))


def _capture(monkeypatch) -> list[tuple[str, str]]:
    enqueued: list[tuple[str, str]] = []
    monkeypatch.setattr(
        career_reservoir, "enqueue_ingest", lambda uid, eid: enqueued.append((uid, eid))
    )
    return enqueued


def test_sweep_requeues_stale_and_leaves_fresh_alone(monkeypatch):
    enqueued = _capture(monkeypatch)
    repo = _FakeRepo([_entry("stale", minutes_old=90), _entry("fresh", minutes_old=2)])

    result = reservoir_ingest_sweep.sweep(repo, now=_NOW)

    assert enqueued == [("u1", "stale")]
    assert result == {"seen": 1, "requeued": 1, "abandoned": 0}


def test_sweep_spans_every_user(monkeypatch):
    """The whole point: no user is scoped in, so nobody has to visit anything."""
    enqueued = _capture(monkeypatch)
    repo = _FakeRepo([
        _entry("a", minutes_old=90, user="u1"),
        _entry("b", minutes_old=120, user="u2"),
    ])

    reservoir_ingest_sweep.sweep(repo, now=_NOW)

    assert set(enqueued) == {("u1", "a"), ("u2", "b")}


def test_sweep_counts_the_attempt_on_the_row(monkeypatch):
    """A per-process counter resets on every redeploy, which is exactly when a
    job dies — so the count lives on the entry."""
    _capture(monkeypatch)
    repo = _FakeRepo([_entry("e1", minutes_old=90, attempts=1)])

    reservoir_ingest_sweep.sweep(repo, now=_NOW)

    assert repo.payload_writes == [("e1", {"sweep_attempts": 2})]


def test_sweep_abandons_with_a_reason_never_silently(monkeypatch):
    """An entry the extractor can never read must stop costing a paid call every
    hour — and must say why it stopped, not just disappear from the work set."""
    enqueued = _capture(monkeypatch)
    repo = _FakeRepo([
        _entry("poison", minutes_old=5000, attempts=reservoir_ingest_sweep.MAX_SWEEP_ATTEMPTS),
    ])

    result = reservoir_ingest_sweep.sweep(repo, now=_NOW)

    assert enqueued == []
    assert repo.skipped == [("poison", "ingest_unreadable")]
    assert result["abandoned"] == 1


def test_sweep_cutoff_is_the_stale_threshold():
    repo = _FakeRepo([])
    reservoir_ingest_sweep.sweep(repo, now=_NOW)
    expected = _NOW - timedelta(seconds=reservoir_ingest_sweep.STALE_AFTER_SECONDS)
    assert repo.asked_cutoff == expected.isoformat()


def test_sweep_handler_is_registered_on_the_work_lane():
    """A handler the Job Runner does not know about is a job it drops while
    reporting OK (registry.py's own header). The registry import is the contract."""
    from app.services.background.registry import registered_job_types

    assert reservoir_ingest_sweep.JOB_TYPE in registered_job_types()
