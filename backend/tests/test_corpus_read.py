"""Corpus Read: `fetch_all_rows` walks a table's unique key, page by page.

The fake models the PostgREST pieces the walk uses — select, eq, gt, order
(appended, like postgrest-py), limit — so these tests hold the interface,
not the query string.
"""

from __future__ import annotations

from typing import Any, Callable

import pytest

from app.repositories.job_skills_read_model import fetch_all_rows, fetch_bounded_rows


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, db: "_DB", table: str) -> None:
        self._db = db
        self._table = table
        self._columns: list[str] = []
        self._eq: list[tuple[str, Any]] = []
        self._gt: list[tuple[str, Any]] = []
        self._order: list[tuple[str, bool]] = []
        self._limit: int | None = None

    def select(self, columns: str) -> "_Query":
        self._columns = [c.strip() for c in columns.split(",")]
        self._db.selects.append(columns)
        return self

    def eq(self, key: str, value: Any) -> "_Query":
        self._eq.append((key, value))
        return self

    def gt(self, key: str, value: Any) -> "_Query":
        self._gt.append((key, value))
        return self

    def order(self, key: str, desc: bool = False) -> "_Query":
        self._order.append((key, desc))
        return self

    def limit(self, value: int) -> "_Query":
        self._limit = value
        return self

    def execute(self) -> _Result:
        self._db.cursors.append(self._gt[0][1] if self._gt else None)
        rows = list(self._db.tables[self._table])
        for key, value in self._eq:
            rows = [r for r in rows if r.get(key) == value]
        for key, value in self._gt:
            rows = [r for r in rows if r[key] > value]
        for key, desc in reversed(self._order):
            rows.sort(key=lambda r, k=key: r[k], reverse=desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        page = [{c: r.get(c) for c in self._columns} for r in rows]
        if self._db.between_pages is not None:
            self._db.between_pages(self._db)
        return _Result(page)


class _DB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self.tables = tables
        self.selects: list[str] = []
        self.cursors: list[Any] = []
        self.between_pages: Callable[["_DB"], None] | None = None

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _jobs(n: int) -> list[dict[str, Any]]:
    # Stored out of key order, the way a heap returns them.
    return [{"job_id": f"j{i:05d}", "company_name": f"c{i % 7}"} for i in reversed(range(n))]


def test_reads_every_row_once_walking_the_key() -> None:
    db = _DB({"jobs": _jobs(2501)})

    rows = fetch_all_rows(db, table="jobs", columns="job_id, company_name", page_size=1000)

    assert [r["job_id"] for r in rows] == [f"j{i:05d}" for i in range(2501)]
    assert db.cursors == [None, "j00999", "j01999"]


def test_jobs_walk_job_id_and_other_tables_walk_id() -> None:
    db = _DB({"user_profiles": [{"id": i, "is_test_account": False} for i in (3, 1, 2)]})

    rows = fetch_all_rows(db, table="user_profiles", columns="id, is_test_account", page_size=2)

    assert [r["id"] for r in rows] == [1, 2, 3]
    assert db.cursors == [None, 2]


def test_adds_the_key_to_the_select_and_strips_it_from_rows() -> None:
    db = _DB({"job_skills": [{"id": i, "job_id": f"j{i}", "is_primary": True} for i in range(5)]})

    rows = fetch_all_rows(db, table="job_skills", columns="job_id, is_primary", page_size=2)

    assert rows == [{"job_id": f"j{i}", "is_primary": True} for i in range(5)]
    assert all(select.startswith("id, ") for select in db.selects)


def test_a_row_inserted_behind_the_cursor_moves_nothing() -> None:
    db = _DB({"jobs": _jobs(30)})
    inserted: list[bool] = []

    def insert_once(fake: _DB) -> None:
        if not inserted:
            fake.tables["jobs"].append({"job_id": "a-new", "company_name": "c0"})
            inserted.append(True)

    db.between_pages = insert_once

    rows = fetch_all_rows(db, table="jobs", columns="job_id", page_size=10)

    ids = [r["job_id"] for r in rows]
    assert ids == [f"j{i:05d}" for i in range(30)]
    assert len(ids) == len(set(ids))


def test_the_caller_filter_holds_on_every_page() -> None:
    db = _DB({"jobs": _jobs(50)})

    rows = fetch_all_rows(
        db,
        table="jobs",
        columns="job_id, company_name",
        query_builder=lambda q: q.eq("company_name", "c3"),
        page_size=3,
    )

    assert {r["company_name"] for r in rows} == {"c3"}
    assert [r["job_id"] for r in rows] == [f"j{i:05d}" for i in range(50) if i % 7 == 3]


def test_a_caller_order_cannot_reorder_the_walk() -> None:
    db = _DB({"jobs": _jobs(25)})

    rows = fetch_all_rows(
        db,
        table="jobs",
        columns="job_id, company_name",
        query_builder=lambda q: q.order("company_name", desc=True),
        page_size=4,
    )

    assert [r["job_id"] for r in rows] == [f"j{i:05d}" for i in range(25)]


def test_page_size_must_be_positive() -> None:
    with pytest.raises(ValueError):
        fetch_all_rows(_DB({"jobs": []}), table="jobs", columns="job_id", page_size=0)


def test_bounded_read_returns_a_table_without_a_single_key() -> None:
    rows = [
        {"location_city": city, "window_key": "30d", "skill_id": sid}
        for city in ("all", "bengaluru")
        for sid in (1, 2)
    ]
    db = _DB({"skill_demand_snapshot": rows})

    out = fetch_bounded_rows(
        db,
        table="skill_demand_snapshot",
        columns="location_city, window_key, skill_id",
        query_builder=lambda q: q.eq("window_key", "30d"),
        bound=5,
    )

    assert len(out) == 4


def test_bounded_read_fails_when_the_page_is_full() -> None:
    rows = [{"location_city": "all", "window_key": "30d", "skill_id": sid} for sid in range(5)]
    db = _DB({"skill_demand_snapshot": rows})

    with pytest.raises(RuntimeError, match="skill_demand_snapshot"):
        fetch_bounded_rows(
            db,
            table="skill_demand_snapshot",
            columns="location_city, window_key, skill_id",
            bound=5,
        )
