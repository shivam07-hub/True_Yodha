from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260613_job_intelligence.sql"
)


def test_job_feedback_migration_is_append_only_and_idempotent() -> None:
    sql = MIGRATION.read_text()

    assert "CREATE TABLE IF NOT EXISTS public.job_feedback_events" in sql
    assert "UNIQUE (user_id, client_event_id)" in sql
    assert "CHECK (feedback_kind IN ('personal', 'quality'))" in sql
    assert "ALTER TABLE public.job_feedback_events ENABLE ROW LEVEL SECURITY" in sql
    assert "FOR INSERT" in sql
    assert "FOR SELECT" in sql
    assert "FOR UPDATE" not in sql
    assert "FOR DELETE" not in sql
    assert "GRANT SELECT, INSERT ON public.job_feedback_events TO authenticated" in sql


def test_job_feedback_migration_indexes_shared_quality_reads() -> None:
    sql = MIGRATION.read_text()

    assert "idx_job_feedback_events_job_quality" in sql
    assert "(job_id, feedback_kind, reason_code)" in sql
