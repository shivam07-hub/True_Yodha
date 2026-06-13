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
    assert (
        "GRANT SELECT, INSERT ON public.job_feedback_events TO authenticated, service_role"
        in sql
    )
    assert (
        "GRANT USAGE, SELECT ON SEQUENCE public.job_feedback_events_id_seq TO authenticated, service_role"
        in sql
    )


def test_job_feedback_migration_indexes_shared_quality_reads() -> None:
    sql = MIGRATION.read_text()

    assert "idx_job_feedback_events_job_quality" in sql
    assert "(job_id, feedback_kind, reason_code)" in sql


def test_job_pulse_snapshot_is_backend_only_and_read_optimized() -> None:
    sql = MIGRATION.read_text()

    assert "CREATE TABLE IF NOT EXISTS public.job_intelligence_snapshots" in sql
    assert "PRIMARY KEY REFERENCES public.jobs(job_id)" in sql
    assert "ALTER TABLE public.job_intelligence_snapshots ENABLE ROW LEVEL SECURITY" in sql
    assert "REVOKE ALL ON public.job_intelligence_snapshots FROM anon, authenticated" in sql
    assert (
        "GRANT SELECT ON public.job_intelligence_snapshots TO service_role"
        in sql
    )
    assert "idx_job_applications_job_status" in sql


def test_job_pulse_snapshot_recomputes_from_canonical_events() -> None:
    sql = MIGRATION.read_text()

    assert "CREATE SCHEMA IF NOT EXISTS private" in sql
    assert "private.refresh_job_intelligence_snapshot" in sql
    assert "SECURITY DEFINER" in sql
    assert "trg_refresh_job_intelligence_from_application" in sql
    assert "trg_refresh_job_intelligence_from_feedback" in sql
    assert "COUNT(DISTINCT user_id)" in sql


def test_job_intelligence_migration_retires_blunt_report_trigger() -> None:
    sql = MIGRATION.read_text()

    assert "DROP TRIGGER IF EXISTS trg_job_report_deactivation" in sql
    assert "posting_inactive" in sql
    assert "INSERT INTO public.job_feedback_events" in sql
