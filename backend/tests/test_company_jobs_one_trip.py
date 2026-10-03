"""A company page's roles in one Supabase hop, with no count of the company.

`count(*) over ()` read every matching row to number fifty — Axis Bank took
10,480ms for a 14.8ms page — and the page's primary skills were a second hop.
Both opened `slow_200:slow_read` Notices on 2026-10-03.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.repositories.jobs import JobsRepository

NOTICE_CAUSE_KEY = "slow_200:slow_read:app/repositories/jobs.py:fetch_company_jobs_page"
NOTICE_CAUSE_KEY = "slow_200:slow_read:app/repositories/job_skills_read_model.py:fetch_all_rows"

_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20261003150000_company_open_roles_one_trip.sql"
)


class _DB:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.rpcs: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> "_DB":
        self.rpcs.append((name, params))
        return self

    def execute(self) -> Any:
        class _R:
            pass

        result = _R()
        result.data = self.rows
        return result

    def table(self, name: str) -> Any:
        raise AssertionError(f"a company page makes one hop; it read {name!r} as well")


def _row(i: int, total: int) -> dict[str, Any]:
    return {
        "job_id": f"j{i}",
        "job_title": f"Role {i}",
        "location": "Mumbai",
        "total_count": total,
        "primary_skills": ["SQL (Programming Language)", "Python (Programming Language)"],
    }


def test_one_call_brings_the_page_its_skills_and_the_count() -> None:
    db = _DB([_row(i, 14_259) for i in range(51)])

    out = JobsRepository(db).fetch_company_jobs_page("Axis Bank", page=1, page_size=50)  # type: ignore[arg-type]

    assert db.rpcs == [
        ("company_open_roles_page", {"p_company": "Axis Bank", "p_limit": 51, "p_offset": 0})
    ]
    assert len(out["jobs"]) == 50
    assert out["has_next"] is True, "the extra row, not the snapshot, says there is more"
    assert out["total"] == 14_259
    assert out["jobs"][0]["primary_skills"] == [
        "SQL (Programming Language)",
        "Python (Programming Language)",
    ]


def test_a_company_newer_than_the_directory_still_counts_what_it_shows() -> None:
    db = _DB([_row(i, 0) for i in range(3)])

    out = JobsRepository(db).fetch_company_jobs_page("Brand New Co", page=1, page_size=50)  # type: ignore[arg-type]

    # A total of 0 would mark a page with three live roles as not indexable.
    assert out["total"] == 3
    assert out["has_next"] is False


def test_the_rpc_never_counts_the_company_in_the_request() -> None:
    sql = _MIGRATION.read_text().lower()
    body = sql.split("as $function$")[1].split("$function$")[0]

    assert "count(*) over" not in body
    assert "from public.company_directory" in body
    assert "security definer" in sql, "the RLS branch made anon read the whole heap (playbook trap 5)"
    assert "to anon, authenticated, service_role" in sql
