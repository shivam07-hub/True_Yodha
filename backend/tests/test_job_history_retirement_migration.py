from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260711c_job_history_safe_retirement.sql"
)


def _sql() -> str:
    return MIGRATION.read_text()


def test_user_history_tables_receive_job_snapshots() -> None:
    sql = _sql()
    for table in (
        "job_applications",
        "cv_versions",
        "cv_application_attempts",
        "job_application_skill_targets",
        "job_application_milestones",
    ):
        assert f"ALTER TABLE public.{table}" in sql
    assert sql.count("ADD COLUMN IF NOT EXISTS job_snapshot JSONB") == 5


def test_retirement_detaches_history_foreign_keys_without_disabling_rls() -> None:
    sql = _sql()
    assert "confrelid = 'public.jobs'::regclass" in sql
    assert "ALTER TABLE public.job_applications DISABLE ROW LEVEL SECURITY" not in sql
    assert "ALTER TABLE public.cv_versions DISABLE ROW LEVEL SECURITY" not in sql


def test_retirement_requires_closed_quarantined_and_rollup_complete() -> None:
    sql = _sql()
    assert "CREATE OR REPLACE FUNCTION public.retire_closed_jobs" in sql
    assert "listing_confidence = 'closed'" in sql
    assert "quarantine_until <= NOW()" in sql
    assert "deletion_eligible_at <= NOW()" in sql
    assert "sr.status = 'complete'" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql


def test_retirement_is_service_only_and_audited() -> None:
    sql = _sql()
    assert "CREATE TABLE IF NOT EXISTS public.job_retirement_events" in sql
    assert "ALTER TABLE public.job_retirement_events ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON FUNCTION public.retire_closed_jobs(INTEGER) FROM PUBLIC" in sql
    assert "GRANT EXECUTE ON FUNCTION public.retire_closed_jobs(INTEGER) TO service_role" in sql
    assert "company_id BIGINT REFERENCES public.companies(id)" in sql


def test_company_skill_facts_are_not_deleted_by_retirement_function() -> None:
    function_sql = _sql().split(
        "CREATE OR REPLACE FUNCTION public.retire_closed_jobs", 1
    )[1]
    assert "DELETE FROM public.company_skill_run_facts" not in function_sql
    assert "DELETE FROM public.company_skill_profiles" not in function_sql


def test_history_updates_do_not_recreate_intelligence_for_deleted_jobs() -> None:
    sql = _sql()
    assert "CREATE OR REPLACE FUNCTION private.refresh_job_intelligence_snapshot_trigger" in sql
    assert "IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = target_job_id)" in sql
