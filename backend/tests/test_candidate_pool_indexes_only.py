"""The Match Run pool reads two narrow indexes, never the jobs heap.

Migration 20261127140000. Every Direction save's Match Run died on 57014 in
`candidate_jobs_for_user` (12 of 12 on 2026-11-27; the Notice below open since
2026-11-02, 150 hits). Measured that day through PostgREST on six real users:
four failed outright and two took 62–66 s; after, every pool completes, the
slowest page 1.6 s, whole pools 0.4–13 s, the same rows.
"""
from __future__ import annotations

from pathlib import Path

NOTICE_CAUSE_KEY = "capacity_503:db.statement_timeout:app/repositories/candidate_jobs.py:fetch_candidate_jobs"


def _body(sql: str) -> str:
    return sql.split("as $$", 1)[1].split("$$;", 1)[0]


READS_INDEXES_ONLY = (
    Path(__file__).parents[2]
    / "database/migrations/20261127140000_candidate_pool_reads_indexes_only.sql"
)


def test_the_pool_reads_two_narrow_indexes_not_the_jobs_heap() -> None:
    """Every Direction save's Match Run died on 57014 here (12 of 12 on
    2026-11-27; Notice open since 11-02, 150). A page read the wide jobs row of
    every job it walked (~10 MB a page on a 5 MB/s disk), and a rare-skill CV
    walked all 59,865 live India jobs to fill page 1. The live index carries
    every column the pool returns and filters on, and a skill's jobs come off
    (skill_id, job_id): both paths are index-only."""
    sql = READS_INDEXES_ONLY.read_text()

    assert "on public.job_skills (skill_id, job_id)" in sql
    cover = sql.split("create index concurrently if not exists idx_jobs_live_pool_cover", 1)[1].split(";", 1)[0]
    for column in ("location_country", "location_mode", "job_title", "role_domain", "career_band",
                   "seniority_level", "min_years_experience", "max_years_experience"):
        assert column in cover
    assert "where is_active is true and listing_confidence = 'active'" in cover


def test_the_planner_knows_how_many_jobs_a_country_holds() -> None:
    """It expected 196 live India jobs; there are 59,865. The only index on
    the country key is partial, so the expression had no statistics."""
    sql = READS_INDEXES_ONLY.read_text()

    assert "create statistics if not exists public.jobs_country_key_stats" in sql
    assert "on (lower(btrim(location_country))) from public.jobs" in sql


def test_the_pool_chooses_its_way_in_by_how_many_skill_rows_it_touches() -> None:
    """Few rows (rare skills): start from them — 8.4 s cancelled → 576 ms.
    Many (generic skills): walk live jobs, a dense match fills the page —
    3,555 ms → 906 ms a mid page. The shapes cross near 30,000 rows."""
    body = _body(READS_INDEXES_ONLY.read_text())

    assert "limit 30001" in body
    assert "if v_skill_rows <= 30000 then" in body
    few, many = body.split("if v_skill_rows <= 30000 then", 1)[1].split("-- Many rows", 1)
    assert "select distinct js.job_id" in few
    assert "join public.jobs j on j.job_id = matched.job_id" in few
    assert "exists (" in many and "js.job_id = j.job_id" in many
    # The skill ids are resolved once, before either way in.
    assert body.index("into v_skill_ids") < body.index("into v_skill_rows")
    assert "js.skill_id in (" not in body


def test_the_pool_cursor_is_one_index_condition_and_plans_each_call() -> None:
    """A cached generic plan cannot turn `p_after_job_id is null or …` into an
    index condition, and cannot see how many skills it was given."""
    sql = READS_INDEXES_ONLY.read_text()
    body = _body(sql)

    assert "v_after text := coalesce(p_after_job_id, '')" in body
    assert "js.job_id > v_after" in body and "j.job_id > v_after" in body
    assert "p_after_job_id is null or" not in body
    assert "set plan_cache_mode to 'force_custom_plan'" in sql


def test_the_pool_keeps_its_rows_signature_and_grants() -> None:
    sql = READS_INDEXES_ONLY.read_text()
    body = _body(sql)

    assert "create or replace function public.candidate_jobs_for_user(" in sql
    for column in ("job_id text", "job_title text", "role_domain text", "career_band text",
                   "seniority_level text", "min_years_experience integer", "max_years_experience integer"):
        assert column in sql
    # Same place rule: that country, or a remote/hybrid row with no country.
    assert "lower(btrim(j.location_country)) = any(v_countries)" in body
    assert "(j.location_country is null or btrim(j.location_country) = '')" in body
    assert "lower(btrim(j.location_mode)) in ('remote', 'hybrid')" in body
    assert "where public.listing_is_live(j)" in body
    assert "revoke all on function public.candidate_jobs_for_user(text[], text[], boolean, text, integer) from public, anon" in sql
    assert "to authenticated, service_role" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_job_skills_keeps_its_visibility_map() -> None:
    """Half its pages were not all-visible (70,535 dead rows, last autovacuum
    11-17), so the index-only probe made 13,780 heap fetches a page."""
    sql = READS_INDEXES_ONLY.read_text()

    assert "alter table public.job_skills set (" in sql
    assert "autovacuum_vacuum_insert_scale_factor = 0.05" in sql
