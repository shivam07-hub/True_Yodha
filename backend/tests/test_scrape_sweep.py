"""Backlog #36 (event-driven matching) — the deterministic pre-filter repo
methods + the scrape_sweep orchestration + its RQ handler."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from app.repositories.jobs import JobsRepository
from app.services.matching import scrape_sweep

_SINCE = datetime(2026, 7, 5, tzinfo=timezone.utc)


# ── repo-level: deterministic pre-filter ────────────────────────────────────


class _FakeMatchingQuery:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def select(self, _cols: str) -> "_FakeMatchingQuery":
        return self

    def eq(self, key: str, value: Any) -> "_FakeMatchingQuery":
        self._rows = [r for r in self._rows if r.get(key) == value]
        return self

    def gt(self, key: str, value: Any) -> "_FakeMatchingQuery":
        self._rows = [r for r in self._rows if (r.get(key) or 0) > value]
        return self

    def in_(self, key: str, values: list[Any]) -> "_FakeMatchingQuery":
        vals = set(values)
        self._rows = [r for r in self._rows if r.get(key) in vals]
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FakeMatchingQuery":
        return self

    def limit(self, n: int) -> "_FakeMatchingQuery":
        self._rows = self._rows[:n]
        return self

    def range(self, start: int, end: int) -> "_FakeMatchingQuery":
        self._rows = self._rows[start : end + 1]
        return self

    def execute(self) -> Any:
        return SimpleNamespace(data=self._rows)


class _FakeMatchingClient:
    """Minimal fake Supabase client — just the chain the pre-filter uses."""

    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _FakeMatchingQuery:
        return _FakeMatchingQuery(list(self._tables.get(name, [])))


def test_get_new_job_ids_since_filters_active_and_landing_time() -> None:
    db = _FakeMatchingClient({
        "jobs": [
            {"job_id": "j1", "is_active": True, "ingested_at": "2026-07-10T04:00:00+00:00"},
            {"job_id": "j2", "is_active": True, "ingested_at": "2026-07-01T04:00:00+00:00"},  # not new
            {"job_id": "j3", "is_active": False, "ingested_at": "2026-07-10T04:00:00+00:00"},  # inactive
        ]
    })
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    since = datetime(2026, 7, 5, tzinfo=timezone.utc)
    assert repo.get_new_job_ids_since(since) == ["j1"]


def test_get_affected_user_ids_prioritizes_followers_and_caps() -> None:
    db = _FakeMatchingClient({
        "job_skills": [{"job_id": "j1", "skill_id": 10}],
        "user_skills": [
            {"user_id": "u1", "skill_id": 10},
            {"user_id": "u2", "skill_id": 10},
            {"user_id": "u3", "skill_id": 10},
        ],
        "jobs": [{"job_id": "j1", "company_name": "Paytm"}],
        "followed_companies": [{"user_id": "u3", "company_name": "Paytm"}],
    })
    repo = JobsRepository(db, db)  # type: ignore[arg-type]

    ordered = repo.get_affected_user_ids(["j1"], limit=10)
    assert ordered[0] == "u3"  # follows the scraped company → priority
    assert set(ordered) == {"u1", "u2", "u3"}

    capped = repo.get_affected_user_ids(["j1"], limit=1)
    assert capped == ["u3"]  # cap keeps the priority user, not an arbitrary one


def test_get_affected_user_ids_empty_when_no_skill_overlap() -> None:
    db = _FakeMatchingClient({"job_skills": [], "user_skills": [], "jobs": []})
    repo = JobsRepository(db, db)  # type: ignore[arg-type]
    assert repo.get_affected_user_ids(["j1"], limit=10) == []


def test_has_computed_matches_true_only_with_a_row() -> None:
    db_empty = _FakeMatchingClient({"user_job_matches": []})
    db_with_row = _FakeMatchingClient({"user_job_matches": [{"job_id": "j1", "user_id": "u1"}]})

    assert JobsRepository(db_empty, db_empty).has_computed_matches("u1") is False  # type: ignore[arg-type]
    assert JobsRepository(db_with_row, db_with_row).has_computed_matches("u1") is True  # type: ignore[arg-type]


# ── orchestration: run_sweep + the RQ handler ───────────────────────────────


class _FakeSweepRepo:
    def __init__(self, new_job_ids: list[str], affected: list[str]) -> None:
        self._new_job_ids = new_job_ids
        self._affected = affected
        self.affected_call: dict[str, Any] = {}

    def get_new_job_ids_since(self, since: datetime) -> list[str]:
        return self._new_job_ids

    def get_affected_user_ids(self, job_ids: list[str], *, limit: int) -> list[str]:
        self.affected_call = {"job_ids": job_ids, "limit": limit}
        return self._affected


def test_run_sweep_no_new_jobs_short_circuits(monkeypatch: Any) -> None:
    repo = _FakeSweepRepo(new_job_ids=[], affected=[])

    def _boom(*_a: Any, **_k: Any) -> None:
        raise AssertionError("must not enqueue when there are no new jobs")

    monkeypatch.setattr(scrape_sweep.background, "enqueue", _boom)

    result = scrape_sweep.run_sweep(repo, since=_SINCE)  # type: ignore[arg-type]

    assert result == {"new_jobs": 0, "affected_users": 0, "enqueued": 0}


def test_run_sweep_enqueues_one_job_per_affected_user_capped(monkeypatch: Any) -> None:
    repo = _FakeSweepRepo(new_job_ids=["j1", "j2"], affected=["u1", "u2"])
    enqueued: list[dict[str, Any]] = []

    def _fake_enqueue(lane: str, job_type: str, *, payload: dict[str, Any], correlation_id: str) -> None:
        enqueued.append({"lane": lane, "job_type": job_type, "payload": payload, "cid": correlation_id})

    monkeypatch.setattr(scrape_sweep.background, "enqueue", _fake_enqueue)

    result = scrape_sweep.run_sweep(repo, since=_SINCE, cap=5)  # type: ignore[arg-type]

    assert repo.affected_call == {"job_ids": ["j1", "j2"], "limit": 5}
    assert result == {"new_jobs": 2, "affected_users": 2, "enqueued": 2}
    assert [e["payload"]["user_id"] for e in enqueued] == ["u1", "u2"]
    assert all(e["job_type"] == "scrape_match_recompute" for e in enqueued)
    assert all(e["lane"] == scrape_sweep.background.LANE_BULK for e in enqueued)
    # Correlation id is per (user, marker) — idempotent re-run of the same sweep.
    assert enqueued[0]["cid"] == "scrape_recompute:u1:202607050000"


class _HandlerRepo:
    def get_existing_match_job_ids(self, _user_id: str) -> list[str]:
        return []

    def get_user_match_stack(self, _user_id: str) -> list[dict[str, Any]]:
        return []


def test_scrape_match_recompute_handler_forces_false_and_never_raises(monkeypatch: Any) -> None:
    """The handler must never propagate — one user's failure can't break the
    sweep or trigger an RQ retry storm (fire-and-forget, like the CV-upload
    initial-match trigger)."""
    captured: dict[str, Any] = {}

    monkeypatch.setattr(scrape_sweep, "get_supabase_admin", lambda: object())
    monkeypatch.setattr(scrape_sweep, "JobsRepository", lambda *_a, **_k: _HandlerRepo())

    async def _fake_run(_repo: Any, user_id: str, _batch_week: Any, *, force: bool, **_kw: Any) -> None:
        captured.update(user_id=user_id, force=force)
        raise RuntimeError("boom — must be swallowed")

    monkeypatch.setattr(scrape_sweep.match_run, "run_match", _fake_run)

    # Must not raise.
    asyncio.run(scrape_sweep._scrape_match_recompute_handler({"user_id": "u1"}, True))

    assert captured == {"user_id": "u1", "force": False}
