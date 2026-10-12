"""GET /cv/versions?job_id=INFSYS-EXTERNAL-247996 500'd eight times on 2026-10-05.

PostgREST answered the company-wide job-id `in_` with a non-JSON "Bad Request"
(`JSON could not be generated`). The thread is the person's versions at that
company, not every job the company has posted.
"""

from __future__ import annotations

from typing import Any

from app.repositories.cv import CVVersionsRepository

NOTICE_CAUSE_KEY = "unhandled_500:APIError:app/repositories/cv.py:list_thread"


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Query:
    def __init__(self, db: "_DB", table: str) -> None:
        self._db = db
        self._table = table
        self._kind: str | None = None
        self._not_kind: str | None = None

    def select(self, *_args: Any) -> "_Query":
        return self

    def eq(self, column: str, value: Any) -> "_Query":
        if column == "kind":
            self._kind = str(value)
        return self

    def neq(self, column: str, value: Any) -> "_Query":
        if column == "kind":
            self._not_kind = str(value)
        return self

    def in_(self, column: str, values: list[Any]) -> "_Query":
        self._db.ins.append((self._table, column, list(values)))
        return self

    def limit(self, _n: int) -> "_Query":
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "_Query":
        return self

    def execute(self) -> _Result:
        rows = [dict(row) for row in self._db.rows.get(self._table, [])]
        if self._kind is not None:
            rows = [row for row in rows if row.get("kind") == self._kind]
        if self._not_kind is not None:
            rows = [row for row in rows if row.get("kind") != self._not_kind]
        return _Result(rows)


class _DB:
    def __init__(self, rows: dict[str, list[dict[str, Any]]]) -> None:
        self.rows = rows
        self.ins: list[tuple[str, str, list[Any]]] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def test_a_large_company_never_puts_its_job_ids_in_the_filter() -> None:
    db = _DB({
        "cv_versions": [
            {"id": 1, "user_id": "u", "kind": "baseline_upload", "job_id": None, "user_version_number": 1},
            {
                "id": 2, "user_id": "u", "kind": "edited", "job_id": "INFSYS-EXTERNAL-247996",
                "user_version_number": 2,
            },
            {"id": 3, "user_id": "u", "kind": "edited", "job_id": "other-job", "user_version_number": 3},
        ],
        "jobs": [
            {"job_id": "INFSYS-EXTERNAL-247996", "company_name": "Infosys", "job_title": "Engineer"},
            {"job_id": "other-job", "company_name": "Acme", "job_title": "Analyst"},
        ],
    })

    rows = CVVersionsRepository(db).list_thread(  # type: ignore[arg-type]
        "u", "Infosys", fallback_job_id="INFSYS-EXTERNAL-247996",
    )

    assert [row["id"] for row in rows] == [2, 1]
    # attach_jobs resolves the person's own job ids. Never the company's.
    assert db.ins
    assert all(len(values) <= 2 for _table, _column, values in db.ins)
