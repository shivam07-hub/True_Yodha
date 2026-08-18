from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import Mock

from app.repositories.candidate_jobs import fetch_candidate_jobs
from app.repositories.jobs import JobsRepository


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260818160000_candidate_jobs_for_user.sql"
)


class _Result:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _Rpc:
    def __init__(self, db: "_SpyDB", name: str, params: dict[str, Any]) -> None:
        self.db = db
        self.name = name
        self.params = params

    def execute(self) -> _Result:
        self.db.rpc_calls.append((self.name, self.params))
        after = self.params.get("p_after_job_id")
        limit = int(self.params.get("p_limit") or 1000)
        rows = self.db.rpc_rows
        if after is not None:
            rows = [row for row in rows if str(row["job_id"]) > str(after)]
        return _Result(rows[:limit])


class _SpyDB:
    def __init__(self, rpc_rows: list[dict[str, Any]]) -> None:
        self.rpc_rows = rpc_rows
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self.table_calls: list[str] = []

    def rpc(self, name: str, params: dict[str, Any]) -> _Rpc:
        return _Rpc(self, name, params)

    def table(self, name: str) -> Any:
        self.table_calls.append(name)
        raise AssertionError(f"candidate pool must not query table {name}")


def _row(job_id: str, **extra: Any) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "job_title": extra.get("job_title", "Analyst"),
        "role_domain": extra.get("role_domain", "Policy"),
        "career_band": extra.get("career_band", "research_people_public_impact"),
        "seniority_level": extra.get("seniority_level", "entry"),
        "min_years_experience": extra.get("min_years_experience", 0),
        "max_years_experience": extra.get("max_years_experience", 2),
    }


def test_fetch_candidate_jobs_empty_keys_skips_rpc() -> None:
    db = _SpyDB([_row("j1")])
    assert fetch_candidate_jobs(db, []) == []
    assert db.rpc_calls == []


def test_fetch_candidate_jobs_5000_pool_completes_without_in_filter() -> None:
    rows = [_row(f"j{i:04d}") for i in range(5_000)]
    db = _SpyDB(rows)

    result = fetch_candidate_jobs(db, ["Python (Programming Language)"])

    assert len(result) == 5_000
    assert db.table_calls == []
    assert all(name == "candidate_jobs_for_user" for name, _ in db.rpc_calls)
    first_params = db.rpc_calls[0][1]
    assert first_params["p_skill_keys"] == ["Python (Programming Language)"]
    assert "job_ids" not in first_params
    assert all(params["p_limit"] == 1000 for _, params in db.rpc_calls)


def test_fetch_candidate_jobs_paginates_past_the_row_cap() -> None:
    rows = [_row(f"j{i:04d}") for i in range(2_501)]
    db = _SpyDB(rows)

    result = fetch_candidate_jobs(db, ["python"])

    assert len(result) == 2_501
    assert [params.get("p_after_job_id") for _, params in db.rpc_calls] == [
        None,
        "j0999",
        "j1999",
    ]


def test_fetch_candidate_jobs_passes_lowercase_countries_in_the_body() -> None:
    db = _SpyDB([_row("j1")])
    fetch_candidate_jobs(
        db,
        ["python"],
        countries=[" India ", "INDIA", "usa"],
        require_fresh=True,
    )
    params = db.rpc_calls[0][1]
    assert params["p_countries"] == ["india", "usa"]
    assert params["p_require_fresh"] is True


def test_filter_job_ids_for_eligibility_uses_preloaded_rows_not_get_jobs_by_ids() -> None:
    repo = object.__new__(JobsRepository)
    repo.get_jobs_by_ids = Mock(side_effect=AssertionError("match path must not refetch"))
    profile = {
        "target_career_band": "research_people_public_impact",
        "target_seniority": "entry",
    }
    jobs = [
        _row("keep"),
        _row("drop", seniority_level="executive", job_title="Vice President"),
    ]

    kept = repo.filter_job_ids_for_eligibility(
        ["keep", "drop", "missing"],
        profile=profile,
        jobs=jobs,
    )

    assert kept == ["keep"]
    repo.get_jobs_by_ids.assert_not_called()


def test_candidate_jobs_migration_keeps_location_and_freshness_semantics() -> None:
    sql = MIGRATION.read_text()

    assert "create or replace function public.candidate_jobs_for_user" in sql
    assert "lower(btrim(j.location_country)) = any(p_countries)" in sql
    assert "lower(btrim(j.location_mode)) in ('remote', 'hybrid')" in sql
    assert "j.location_country is null or btrim(j.location_country) = ''" in sql
    assert "j.is_active is true and j.listing_confidence = 'active'" in sql
    assert "last_seen" not in sql.split("as $$", 1)[1].split("$$;", 1)[0]
    assert "p_after_job_id" in sql
    assert "revoke all on function public.candidate_jobs_for_user" in sql
    assert "grant execute on function public.candidate_jobs_for_user" in sql
    assert "notify pgrst, 'reload schema';" in sql
