"""/intel's Open Roles panel reads live roles only, through an index in order.

It had no liveness filter (an "Open roles" panel listing closed jobs) and no
index behind its ORDER BY, so LIMIT 6 sorted all 17,844 Axis Bank rows: 10.6s,
past the 8s PostgREST timeout (`capacity_503:upstream.read_timeout`).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.repositories import jobs as jobs_repo

_INDEX = (
    Path(__file__).parents[2]
    / "database/migrations/20261003130000_live_company_roles_index.sql"
)


class _Query:
    def __init__(self, calls: list[tuple[str, Any]]) -> None:
        self._calls = calls

    def select(self, *_a: Any) -> "_Query":
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        self._calls.append(("eq", (column, value)))
        return self

    def order(self, column: str, *, desc: bool = False) -> "_Query":
        self._calls.append(("order", (column, desc)))
        return self

    def limit(self, n: int) -> "_Query":
        self._calls.append(("limit", n))
        return self

    def execute(self) -> Any:
        class _R:
            data: list[dict[str, Any]] = []

        return _R()


class _DB:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []

    def table(self, name: str) -> _Query:
        assert name == "jobs"
        return _Query(self.calls)


def test_open_roles_are_live_roles(monkeypatch) -> None:
    monkeypatch.setattr(jobs_repo, "_search_cache", {})
    db = _DB()

    jobs_repo.JobsRepository(db).list_jobs_at_company("Axis Bank", limit=6)  # type: ignore[arg-type]

    filters = {value for kind, value in db.calls if kind == "eq"}
    assert ("company_name", "Axis Bank") in filters
    assert ("is_active", True) in filters
    assert ("listing_confidence", "active") in filters
    assert ("order", ("first_seen", True)) in db.calls


def test_the_index_matches_the_read_it_serves() -> None:
    sql = _INDEX.read_text()

    assert "ON public.jobs (company_name, first_seen DESC)" in sql
    assert "WHERE is_active AND listing_confidence = 'active'" in sql
