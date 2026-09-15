from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260914002000_job_delete_skips_interest_rebuild.sql"
)


def _sql() -> str:
    return MIGRATION.read_text()


def test_child_delete_triggers_do_not_run_after_the_job_is_gone() -> None:
    sql = _sql()
    assert sql.count("WHEN (EXISTS (SELECT 1 FROM public.jobs j WHERE j.job_id = OLD.job_id))") == 5
    assert "sync_job_verification_interest_exposures_del" in sql
    assert "sync_job_verification_interest_applications_del" in sql
    assert "sync_job_verification_interest_matches_del" in sql
    assert "trg_refresh_job_intelligence_from_application_del" in sql
    assert "trg_refresh_job_intelligence_from_feedback_del" in sql


def test_retire_does_not_need_superuser_replication_role() -> None:
    fn = _sql().split("CREATE OR REPLACE FUNCTION public.retire_closed_jobs", 1)[1]
    assert "session_replication_role" not in fn
    assert "DELETE FROM public.jobs" in fn
    assert "candidate.confidence_reason" in fn
