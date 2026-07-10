import re
from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260711b_company_skill_intelligence.sql"
)


def _sql() -> str:
    return re.sub(r"\s+", " ", MIGRATION.read_text(encoding="utf-8"))


def test_company_identity_supports_canonical_names_and_aliases() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.companies" in sql
    assert "canonical_key TEXT NOT NULL UNIQUE" in sql
    assert "slug TEXT NOT NULL UNIQUE" in sql
    assert "CREATE TABLE IF NOT EXISTS public.company_aliases" in sql
    assert "alias_key TEXT PRIMARY KEY" in sql
    assert "REFERENCES public.companies(id) ON DELETE CASCADE" in sql
    assert "ADD COLUMN IF NOT EXISTS company_id BIGINT" in sql
    assert "UPDATE public.jobs j" in sql


def test_company_skill_run_facts_are_point_in_time_not_cumulative() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.company_skill_run_facts" in sql
    assert "PRIMARY KEY (source_run_id, company_id, skill_id)" in sql
    assert "active_job_count INTEGER NOT NULL" in sql
    assert "primary_job_count INTEGER NOT NULL" in sql
    assert "required_level_counts JSONB" in sql
    assert "role_domain_counts JSONB" in sql
    assert "location_counts JSONB" in sql


def test_company_skill_profiles_preserve_history_and_latest_demand() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.company_skill_profiles" in sql
    assert "PRIMARY KEY (company_id, skill_id)" in sql
    assert "first_seen_at TIMESTAMPTZ NOT NULL" in sql
    assert "last_seen_at TIMESTAMPTZ NOT NULL" in sql
    assert "latest_job_count INTEGER NOT NULL" in sql
    assert "peak_job_count INTEGER NOT NULL" in sql
    assert "observation_run_count INTEGER NOT NULL" in sql
    assert "trend_direction IN ( 'emerging', 'steady', 'declining', 'dormant' )" in sql


def test_profile_refresh_uses_only_complete_runs_and_compares_previous_period() -> None:
    sql = _sql()

    assert "public.refresh_company_skill_profiles" in sql
    assert "jsr.status = 'complete'" in sql
    assert "ROW_NUMBER() OVER" in sql
    assert "WHEN previous_job_count IS NULL THEN 'steady'" in sql
    assert "THEN 'emerging'" in sql
    assert "THEN 'declining'" in sql
    assert "GRANT EXECUTE ON FUNCTION public.refresh_company_skill_profiles(UUID) TO service_role" in sql


def test_company_intelligence_is_backend_only_with_rls_and_indexes() -> None:
    sql = _sql()

    for table in (
        "companies",
        "company_aliases",
        "company_skill_run_facts",
        "company_skill_profiles",
    ):
        assert f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY" in sql
        assert f"REVOKE ALL ON public.{table} FROM anon, authenticated" in sql

    assert "idx_company_skill_profiles_company_demand" in sql
    assert "idx_company_skill_run_facts_skill_observed" in sql
    assert "GRANT SELECT ON public.company_skill_profiles TO service_role" in sql
    assert "NOTIFY pgrst, 'reload schema';" in sql
