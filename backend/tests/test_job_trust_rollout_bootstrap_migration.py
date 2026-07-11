from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260711e_job_trust_rollout_bootstrap.sql"
)


def _sql() -> str:
    return MIGRATION.read_text()


def test_bootstrap_seeds_company_skills_from_only_trusted_active_jobs() -> None:
    sql = _sql()

    assert "trusted-active-bootstrap" in sql
    assert "INSERT INTO public.company_skill_run_facts" in sql
    assert "j.listing_confidence = 'active'" in sql
    assert "j.is_active IS TRUE" in sql
    assert "public.refresh_company_skill_profiles(source_run.id)" in sql


def test_bootstrap_is_not_deletion_evidence() -> None:
    sql = _sql()

    assert "'absence_evidence', false" in sql
    assert "sr.id = j.last_source_run_id" in sql
    assert "sr.completed_at >= j.quarantined_at" in sql
    assert "j.quarantined_at IS NOT NULL" in sql


def test_retirement_still_preserves_user_history_before_deletion() -> None:
    sql = _sql()

    for table in (
        "job_applications",
        "cv_versions",
        "cv_application_attempts",
        "job_application_skill_targets",
        "job_application_milestones",
    ):
        assert f"UPDATE public.{table}" in sql
    assert "DELETE FROM public.jobs" in sql
