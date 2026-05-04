from __future__ import annotations

from typing import Any

from app.repositories.job_skills_read_model import fetch_all_rows, fetch_job_skill_rows
from app.repositories.jobs import JobsRepository


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _FakeQuery:
    def __init__(self, rows: list[dict[str, Any]], *, table: str, db: "_FakeDB") -> None:
        self._rows = rows
        self._table = table
        self._db = db
        self._eq_filters: list[tuple[str, Any]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, _columns: str) -> "_FakeQuery":
        return self

    def eq(self, key: str, value: Any) -> "_FakeQuery":
        self._eq_filters.append((key, value))
        return self

    def limit(self, value: int) -> "_FakeQuery":
        self._limit = value
        return self

    def range(self, start: int, end: int) -> "_FakeQuery":
        self._range = (start, end)
        self._db.ranges.append((self._table, start, end))
        return self

    def execute(self) -> _Result:
        rows = self._rows
        for key, value in self._eq_filters:
            rows = [row for row in rows if row.get(key) == value]

        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        elif self._limit is not None:
            rows = rows[: self._limit]

        return _Result(rows)


class _FakeDB:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]) -> None:
        self._tables = tables
        self.ranges: list[tuple[str, int, int]] = []

    def table(self, name: str) -> _FakeQuery:
        return _FakeQuery(self._tables.get(name, []), table=name, db=self)


def test_fetch_all_rows_paginates_until_short_page() -> None:
    rows = [{"job_id": f"j{i}"} for i in range(2501)]
    db = _FakeDB({"jobs": rows})

    result = fetch_all_rows(
        db,
        table="jobs",
        columns="job_id",
        page_size=1000,
    )

    assert len(result) == 2501
    assert db.ranges == [
        ("jobs", 0, 999),
        ("jobs", 1000, 1999),
        ("jobs", 2000, 2999),
    ]


def test_fetch_job_skill_rows_respects_primary_filter_across_pages() -> None:
    rows = [
        {"job_id": "a", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "a", "is_primary": False, "skills": {"taxonomy_key": "excel"}},
        {"job_id": "b", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
        {"job_id": "c", "is_primary": False, "skills": {"taxonomy_key": "jira"}},
        {"job_id": "d", "is_primary": True, "skills": {"taxonomy_key": "aws"}},
    ]
    db = _FakeDB({"job_skills": rows})

    result = fetch_job_skill_rows(db, only_primary=True, page_size=2)

    assert [r["job_id"] for r in result] == ["a", "b", "d"]
    assert db.ranges == [
        ("job_skills", 0, 1),
        ("job_skills", 2, 3),
    ]


def test_jobs_repository_fetch_analytics_rows_reads_all_pages() -> None:
    jobs = [
        {"job_id": f"j{i}", "company_name": "Acme" if i % 2 == 0 else "Globex", "industry": "Tech", "batch_date": 20260504}
        for i in range(1500)
    ]
    job_skills = [
        {"job_id": "j0", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "j1200", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
    ]
    db = _FakeDB({"jobs": jobs, "job_skills": job_skills})

    rows = JobsRepository(db).fetch_analytics_rows()

    assert len(rows) == 1500
    by_id = {row["job_id"]: row for row in rows}
    assert by_id["j0"]["main_skills"] == ["python"]
    assert by_id["j1200"]["main_skills"] == ["sql"]
    assert ("jobs", 0, 999) in db.ranges
    assert ("jobs", 1000, 1999) in db.ranges
