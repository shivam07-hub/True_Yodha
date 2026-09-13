from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260913180000_closed_job_unload_one_hour.sql"
)


def _sql() -> str:
    return MIGRATION.read_text()


def test_unload_rpc_drops_the_source_run_join_that_never_deleted() -> None:
    sql = _sql()
    fn = sql.split("CREATE OR REPLACE FUNCTION public.retire_closed_jobs", 1)[1]
    assert "listing_confidence = 'closed'" in fn
    assert "deletion_eligible_at <= NOW()" in fn
    assert "completed_at >= j.quarantined_at" not in fn
    assert "p_job_ids TEXT[] DEFAULT NULL" in fn
    assert "p_job_ids required" in fn
    assert "DELETE FROM public.jobs" in fn


def test_already_closed_rows_are_due_immediately() -> None:
    sql = _sql()
    fn_comment = sql.split("COMMENT ON FUNCTION public.retire_closed_jobs", 1)[1]
    assert "one-hour quarantine" in fn_comment
    backfill = sql.split("UPDATE public.jobs", 1)[1]
    assert "deletion_eligible_at = NOW()" in backfill
    assert "NOW() + INTERVAL" not in backfill
    assert "listing_confidence = 'closed'" in backfill
    assert "'job-archives'" not in sql


def test_archives_live_outside_the_database() -> None:
    sql = _sql()
    assert "CREATE OR REPLACE FUNCTION public.list_unload_candidates" in sql
    assert "INSERT INTO storage.buckets" not in sql


def test_retirement_audit_reads_confidence_reason_jobs_never_had_lifecycle_reason() -> None:
    fn = _sql().split("CREATE OR REPLACE FUNCTION public.retire_closed_jobs", 1)[1]
    assert "candidate.confidence_reason" in fn
    assert "candidate.lifecycle_reason" not in fn
