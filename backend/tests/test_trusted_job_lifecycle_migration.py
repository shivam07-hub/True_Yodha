import re
from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260711_trusted_job_lifecycle.sql"
)


def _sql() -> str:
    return MIGRATION.read_text(encoding="utf-8")


def test_jobs_gain_materialized_lifecycle_state_without_deleting_rows() -> None:
    sql = _sql()

    assert "ADD COLUMN IF NOT EXISTS listing_confidence TEXT" in sql
    assert "ADD COLUMN IF NOT EXISTS last_verified_live_at TIMESTAMPTZ" in sql
    assert "ADD COLUMN IF NOT EXISTS consecutive_complete_misses INTEGER" in sql
    assert "ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ" in sql
    assert "ADD COLUMN IF NOT EXISTS deletion_eligible_at TIMESTAMPTZ" in sql
    assert "listing_confidence IN ('active', 'uncertain', 'likely_closed', 'closed')" in sql
    assert "DELETE FROM public.jobs" not in sql


def test_source_runs_capture_company_level_completeness() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.job_source_runs" in sql
    assert "status IN ('complete', 'partial', 'failed', 'blocked')" in sql
    assert "UNIQUE (feed_run_id, company_name, source_key)" in sql
    assert "coverage_ratio" in sql
    assert "prior_good_count" in sql


def test_listing_observations_are_append_only_and_survive_job_deletion() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.job_listing_observations" in sql
    assert re.search(r"job_id\s+TEXT NOT NULL", sql)
    assert "REFERENCES public.jobs(job_id)" not in sql.split(
        "CREATE TABLE IF NOT EXISTS public.job_listing_observations", 1
    )[1].split(";", 1)[0]
    assert "observer IN ('scraper', 'verifier', 'user', 'operator')" in sql
    assert "result IN (" in sql
    assert "UNIQUE (user_id, client_event_id)" in sql
    assert "FOR UPDATE" not in sql
    assert "FOR DELETE" not in sql


def test_recommendation_exposures_are_backend_only_and_bounded_by_index() -> None:
    sql = _sql()

    assert "CREATE TABLE IF NOT EXISTS public.job_recommendation_exposures" in sql
    assert "confidence_at_show" in sql
    assert "verified_live_at" in sql
    assert "idx_job_recommendation_exposures_shown_at" in sql
    assert "REVOKE ALL ON public.job_recommendation_exposures FROM anon, authenticated" in sql
    assert "GRANT SELECT, INSERT, DELETE ON public.job_recommendation_exposures TO service_role" in sql


def test_feedback_records_positive_liveness_and_transfers_to_observations() -> None:
    sql = _sql()

    assert "'apply_link_live'" in sql
    assert "private.capture_job_feedback_observation" in sql
    assert "trg_capture_job_feedback_observation" in sql
    assert "apply_link_closed" in sql
    assert "apply_link_live" in sql


def test_internal_lifecycle_tables_use_rls_and_explicit_service_grants() -> None:
    sql = _sql()

    for table in (
        "job_source_runs",
        "job_listing_observations",
        "job_recommendation_exposures",
    ):
        assert f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY" in sql
        assert f"REVOKE ALL ON public.{table} FROM anon, authenticated" in sql

    assert "GRANT SELECT, INSERT, UPDATE ON public.job_source_runs TO service_role" in sql
    assert "GRANT SELECT, INSERT ON public.job_listing_observations TO service_role" in sql
    assert "NOTIFY pgrst, 'reload schema';" in sql
