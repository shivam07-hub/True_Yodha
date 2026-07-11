from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260711g_job_trust_boundary_hardening.sql"
)


def test_public_jobs_policy_exposes_only_trusted_active_listings() -> None:
    sql = MIGRATION.read_text()

    assert 'DROP POLICY IF EXISTS "jobs public read"' in sql
    assert 'CREATE POLICY "jobs public read"' in sql
    assert "listing_confidence = 'active'" in sql
    assert "is_active IS TRUE" in sql


def test_new_foreign_keys_have_covering_indexes() -> None:
    sql = MIGRATION.read_text()

    for index in (
        "idx_jobs_last_source_run_id",
        "idx_company_skill_profiles_latest_source_run",
        "idx_job_recommendation_exposures_match_id",
        "idx_job_retirement_events_company_id",
        "idx_job_retirement_events_source_run_id",
    ):
        assert index in sql
