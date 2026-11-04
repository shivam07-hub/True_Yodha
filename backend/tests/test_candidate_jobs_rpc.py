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
        # No stated range: the senior-side tag is the only signal, and an
        # entry centre is under 5, so the tag rejects. A stated 0-2 would
        # have been kept — the range wins over the title.
        _row(
            "drop",
            seniority_level="executive",
            job_title="Vice President",
            min_years_experience=None,
            max_years_experience=None,
        ),
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


NOTICE_CAUSE_KEY = "work_lane:initial_match:APIError"

IDS_FIRST = (
    Path(__file__).parents[2]
    / "database/migrations/20260928100000_candidate_jobs_ids_first.sql"
)


def _body(sql: str) -> str:
    return sql.split("as $$", 1)[1].split("$$;", 1)[0]


def test_the_pool_walks_live_jobs_in_the_named_country() -> None:
    """After the page-stop, India limit 20 was still cancelled at 8s and
    limit 1000 returned in 6.9s. The live predicate has to be its own branch
    so the country index can walk India's open jobs and stop."""
    sql = (
        Path(__file__).parents[2]
        / "database/migrations/20261102233000_candidate_pool_reads_live_india.sql"
    ).read_text()

    assert "idx_jobs_live_country_jobid" in sql
    assert "idx_jobs_live_blank_country_jobid" in sql
    assert "language plpgsql" in sql
    assert "union all" in sql
    assert "where public.listing_is_live(j)" in sql
    assert "lower(btrim(j.location_country)) = any(v_countries)" in sql
    assert "lower(btrim(j.location_mode)) in ('remote', 'hybrid')" in sql
    body = sql.split("as $$", 1)[1].split("$$;", 1)[0]
    assert "not p_require_fresh" not in body
    assert "j.min_years_experience::integer" in body
    assert "j.max_years_experience::integer" in body


def test_the_pool_stops_at_the_page_instead_of_sorting_every_overlap() -> None:
    """The ids-first page still died at 8s on a CV with a generic skill, and
    the first Match Run is still JOB initial_match. A page of live jobs, with
    the skill check per job, fills the limit and does not sort the corpus."""
    sql = (
        Path(__file__).parents[2]
        / "database/migrations/20261102231000_candidate_pool_stops_at_the_page.sql"
    ).read_text()
    body = _body(sql)

    assert body.index("from public.jobs j") < body.index("from public.job_skills js")
    assert "select distinct" not in body
    assert "cross join lateral" not in body
    assert "j.job_id > p_after_job_id" in body
    assert "or public.listing_is_live(j)" in body
    assert "lower(btrim(j.location_country)) = any(p_countries)" in body
    assert "lower(btrim(j.location_mode)) in ('remote', 'hybrid')" in body
    assert "limit greatest(1, least(coalesce(p_limit, 1000), 1000))" in body


def test_the_pool_sorts_ids_before_it_opens_a_job() -> None:
    """A 30-skill CV with two generic skills joined 29,853 skill rows to `jobs`
    one probe at a time, sorted the survivors to disk, and hit the 8s timeout
    on the first page of a new user's Match Run. Distinct ids first, then the
    jobs a page needs: 2,809 probes, a fifth of the buffers."""
    body = _body(IDS_FIRST.read_text())

    ids_at = body.index("from public.job_skills js")
    jobs_at = body.index("from public.jobs j")
    assert ids_at < jobs_at
    assert "cross join lateral" in body
    assert "join public.jobs" not in body
    # The cursor narrows the ids, not the probed jobs.
    assert "js.job_id > p_after_job_id" in body
    # Same eligibility as the first definition.
    assert "j.is_active is true and j.listing_confidence = 'active'" in body
    assert "lower(btrim(j.location_country)) = any(p_countries)" in body
    assert "lower(btrim(j.location_mode)) in ('remote', 'hybrid')" in body
