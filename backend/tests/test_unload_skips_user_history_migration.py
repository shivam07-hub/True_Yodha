from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20261015083000_unload_skips_user_history.sql"
)

_TABLES = (
    "user_job_matches",
    "job_applications",
    "job_feedback_events",
    "job_reports",
)


def _sql() -> str:
    return MIGRATION.read_text()


def test_lister_and_deleter_both_skip_user_history() -> None:
    sql = _sql()
    lister = sql.split("CREATE OR REPLACE FUNCTION public.list_unload_candidates", 1)[1]
    lister = lister.split("CREATE OR REPLACE FUNCTION public.retire_closed_jobs", 1)[0]
    deleter = sql.split("CREATE OR REPLACE FUNCTION public.retire_closed_jobs", 1)[1]
    deleter = deleter.split("COMMENT ON FUNCTION public.retire_closed_jobs", 1)[0]
    for table in _TABLES:
        assert f"public.{table}" in lister
        assert f"public.{table}" in deleter
    assert "DELETE FROM public.jobs" in deleter
    assert "p_job_ids required" in deleter


def test_migration_does_not_restamp_existing_clocks() -> None:
    sql = _sql()
    assert "UPDATE public.jobs" not in sql
    assert "INSERT INTO storage.buckets" not in sql
