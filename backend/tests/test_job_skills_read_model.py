from __future__ import annotations

from typing import Any
from unittest.mock import patch

from app.repositories.job_skills_read_model import fetch_all_rows, fetch_job_skill_rows
import app.repositories.jobs as jobs_module
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
        self._in_filters: list[tuple[str, list[Any]]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None

    def select(self, _columns: str) -> "_FakeQuery":
        return self

    def eq(self, key: str, value: Any) -> "_FakeQuery":
        self._eq_filters.append((key, value))
        return self

    def in_(self, key: str, values: list[Any]) -> "_FakeQuery":
        self._in_filters.append((key, values))
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
        for key, values in self._in_filters:
            rows = [row for row in rows if row.get(key) in values]

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


def test_fetch_job_skill_rows_scoped_to_job_ids() -> None:
    rows = [
        {"job_id": "a", "is_primary": True, "skills": {"taxonomy_key": "python"}},
        {"job_id": "b", "is_primary": True, "skills": {"taxonomy_key": "sql"}},
        {"job_id": "c", "is_primary": False, "skills": {"taxonomy_key": "jira"}},
    ]
    db = _FakeDB({"job_skills": rows})

    result = fetch_job_skill_rows(db, job_ids=["a", "c"])

    assert {r["job_id"] for r in result} == {"a", "c"}
    assert len(result) == 2


def test_fetch_job_skill_rows_empty_job_ids_returns_empty() -> None:
    rows = [{"job_id": "a", "is_primary": True, "skills": {"taxonomy_key": "python"}}]
    db = _FakeDB({"job_skills": rows})

    result = fetch_job_skill_rows(db, job_ids=[])

    assert result == []


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


def _make_analytics_db() -> "_FakeDB":
    jobs = [{"job_id": "j0", "company_name": "Acme", "industry": "Tech", "batch_date": 20260504}]
    job_skills = [{"job_id": "j0", "is_primary": True, "skills": {"taxonomy_key": "python"}}]
    return _FakeDB({"jobs": jobs, "job_skills": job_skills})


def test_compile_market_analytics_caches_within_ttl() -> None:
    jobs_module._analytics_cache.clear()
    db = _make_analytics_db()
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        result1 = repo.compile_market_analytics()

    # Second call within TTL — DB should NOT be hit again (ranges unchanged)
    ranges_after_first = list(db.ranges)
    with patch("app.repositories.jobs.time.monotonic", return_value=1800.0):
        result2 = repo.compile_market_analytics()

    assert result1 is result2
    assert db.ranges == ranges_after_first


def test_compile_market_analytics_invalidates_after_ttl() -> None:
    jobs_module._analytics_cache.clear()
    db = _make_analytics_db()
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        result1 = repo.compile_market_analytics()

    ranges_after_first = list(db.ranges)
    with patch("app.repositories.jobs.time.monotonic", return_value=3601.0):
        result2 = repo.compile_market_analytics()

    assert result1 is not result2
    assert len(db.ranges) > len(ranges_after_first)


def test_compile_market_analytics_keyed_by_role_domain() -> None:
    jobs_module._analytics_cache.clear()
    db = _make_analytics_db()
    repo = JobsRepository(db)

    with patch("app.repositories.jobs.time.monotonic", return_value=0.0):
        repo.compile_market_analytics(role_domain=None)
        repo.compile_market_analytics(role_domain="Engineering")

    assert None in jobs_module._analytics_cache
    assert "Engineering" in jobs_module._analytics_cache


def test_get_candidate_job_ids_for_skills_scopes_correctly() -> None:
    db = _FakeDB({
        "skills": [
            {"id": "s1", "taxonomy_key": "python"},
            {"id": "s2", "taxonomy_key": "sql"},
            {"id": "s3", "taxonomy_key": "excel"},
        ],
        "job_skills": [
            {"job_id": "j1", "skill_id": "s1"},
            {"job_id": "j2", "skill_id": "s2"},
            {"job_id": "j3", "skill_id": "s3"},
            {"job_id": "j1", "skill_id": "s2"},
        ],
    })

    result = JobsRepository(db).get_candidate_job_ids_for_skills(["python", "sql"])

    assert set(result) == {"j1", "j2"}


def test_get_candidate_job_ids_for_skills_empty_keys_returns_empty() -> None:
    db = _FakeDB({"skills": [], "job_skills": []})
    assert JobsRepository(db).get_candidate_job_ids_for_skills([]) == []


def test_get_candidate_job_ids_for_skills_no_match_returns_empty() -> None:
    db = _FakeDB({
        "skills": [{"id": "s1", "taxonomy_key": "python"}],
        "job_skills": [{"job_id": "j1", "skill_id": "s1"}],
    })
    assert JobsRepository(db).get_candidate_job_ids_for_skills(["java"]) == []
