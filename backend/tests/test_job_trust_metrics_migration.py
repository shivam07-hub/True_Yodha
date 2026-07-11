from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260711d_job_trust_metrics.sql"
)


def test_metrics_views_cover_exposures_and_apply_liveness() -> None:
    sql = MIGRATION.read_text()
    assert "CREATE OR REPLACE VIEW public.job_trust_exposure_daily" in sql
    assert "verified_live_exposure_rate" in sql
    assert "CREATE OR REPLACE VIEW public.job_apply_liveness_daily" in sql
    assert "dead_click_rate" in sql


def test_metrics_are_service_only() -> None:
    sql = MIGRATION.read_text()
    assert "REVOKE ALL ON public.job_trust_exposure_daily FROM anon, authenticated" in sql
    assert "REVOKE ALL ON public.job_apply_liveness_daily FROM anon, authenticated" in sql
    assert "GRANT SELECT ON public.job_trust_exposure_daily TO service_role" in sql
