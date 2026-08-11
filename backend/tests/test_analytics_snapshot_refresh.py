"""Tests for the dirty-guarded analytics snapshot refresh (B-smart).

Covers JobsRepository.refresh_analytics_snapshot_if_stale:
- unchanged jobs marker → skip compile, refreshed=False, no upsert
- changed jobs marker → recompile, refreshed=True, upsert carries new marker
- first run (no stored marker) → always recompiles
"""

from __future__ import annotations

from typing import Any

from app.repositories import jobs as jobs_module
from app.repositories.jobs import JobsRepository


class _Result:
    def __init__(self, data: Any = None, count: int | None = None) -> None:
        self.data = data
        self.count = count


class _FakeAdmin:
    """Routes the handful of query chains the refresh path issues, keyed by
    table + whether an exact count was requested. Captures upserts."""

    def __init__(self, *, job_count: int, last_seen: int, snapshot_row: dict[str, Any] | None) -> None:
        self.job_count = job_count
        self.last_seen = last_seen
        self.snapshot_row = snapshot_row
        self.upserts: list[dict[str, Any]] = []
        self._table = ""
        self._count_mode = False
        self._select = ""

    def table(self, name: str) -> "_FakeAdmin":
        self._table = name
        self._count_mode = False
        self._select = ""
        return self

    def select(self, *cols: Any, **kw: Any) -> "_FakeAdmin":
        self._select = cols[0] if cols else ""
        self._count_mode = kw.get("count") == "exact"
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    @property
    def not_(self) -> "_FakeAdmin":
        return self

    def is_(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def upsert(self, payload: dict[str, Any], **_k: Any) -> "_FakeAdmin":
        self.upserts.append(payload)
        return self

    def execute(self) -> _Result:
        if self._table == "jobs":
            if self._count_mode:
                return _Result(count=self.job_count)
            return _Result(data=[{"last_seen": self.last_seen}])
        # market_analytics_snapshot reads
        if self.snapshot_row is None:
            return _Result(data=[])
        return _Result(data=[self.snapshot_row])


def _repo(admin: _FakeAdmin) -> JobsRepository:
    repo = JobsRepository(db=admin, admin_db=admin)  # type: ignore[arg-type]
    repo.fetch_analytics_rows = lambda *a, **k: [{"company_name": "Acme"}]  # type: ignore[assignment]
    repo._analytics_compiler.compile = lambda rows: {  # type: ignore[assignment]
        "total_jobs": 9001,
        "total_companies": 42,
    }
    return repo


def test_skips_compile_when_marker_unchanged() -> None:
    admin = _FakeAdmin(
        job_count=100,
        last_seen=20260610,
        snapshot_row={
            "source_job_count": 100,
            "source_last_seen": 20260610,
            "payload": {
                "total_jobs": 5000,
                "total_companies": 30,
                "industry_roles": {"Technology": [["Engineering", 120]]},
            },
        },
    )
    out = _repo(admin).refresh_analytics_snapshot_if_stale()
    assert out["refreshed"] is False
    assert out["total_jobs"] == 5000
    assert out["total_companies"] == 30
    assert admin.upserts == []  # no recompile / write


def test_recompiles_when_job_count_changes() -> None:
    admin = _FakeAdmin(
        job_count=150,  # grew since last refresh
        last_seen=20260610,
        snapshot_row={
            "source_job_count": 100,
            "source_last_seen": 20260610,
            "payload": {"total_jobs": 5000, "total_companies": 30},
        },
    )
    out = _repo(admin).refresh_analytics_snapshot_if_stale()
    assert out["refreshed"] is True
    assert out["total_jobs"] == 9001
    assert len(admin.upserts) == 1
    written = admin.upserts[0]
    assert written["source_job_count"] == 150
    assert written["source_last_seen"] == 20260610


def test_recompiles_when_snapshot_predates_industry_role_payload() -> None:
    admin = _FakeAdmin(
        job_count=100,
        last_seen=20260610,
        snapshot_row={
            "source_job_count": 100,
            "source_last_seen": 20260610,
            "payload": {"total_jobs": 5000, "total_companies": 30},
        },
    )

    out = _repo(admin).refresh_analytics_snapshot_if_stale()

    assert out["refreshed"] is True
    assert len(admin.upserts) == 1


def test_recompiles_on_first_run_without_stored_marker() -> None:
    admin = _FakeAdmin(job_count=100, last_seen=20260610, snapshot_row=None)
    out = _repo(admin).refresh_analytics_snapshot_if_stale()
    assert out["refreshed"] is True
    assert len(admin.upserts) == 1
    assert admin.upserts[0]["source_job_count"] == 100


def test_fetch_analytics_rows_requests_main_skills(monkeypatch) -> None:
    """compile() builds top_skills from each row's main_skills. If the row fetch
    omits that column the aggregate is SILENTLY empty (no error) — the stuck
    "skill-demand movers" card. Guard the column contract so it can't regress."""
    captured: dict[str, str] = {}

    def _fake_fetch_all_rows(db: Any, *, table: str, columns: str, query_builder: Any = None) -> list[Any]:
        captured["columns"] = columns
        return []

    monkeypatch.setattr(jobs_module, "fetch_all_rows", _fake_fetch_all_rows)
    repo = JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]
    repo.fetch_analytics_rows(location_city="Bangalore")
    assert "main_skills" in captured["columns"]
