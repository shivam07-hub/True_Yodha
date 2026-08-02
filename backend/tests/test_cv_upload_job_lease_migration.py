from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database"
    / "migrations"
    / "20260802173451_cv_upload_job_leases.sql"
)
POLICY_MIGRATION = (
    Path(__file__).parents[2]
    / "database"
    / "migrations"
    / "20260802173715_cv_upload_job_policy_hardening.sql"
)


def test_cv_upload_orphan_sweep_uses_a_worker_lease() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "add column if not exists lease_expires_at timestamptz" in sql
    assert "idx_cv_upload_jobs_processing_lease" in sql
    assert "coalesce(c.lease_expires_at" in sql
    assert "c.status = 'processing'" in sql
    assert "lease_expires_at = null" in sql
    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "revoke all on function public.sweep_stale_cv_upload_jobs(integer) from public" in sql
    assert "grant execute on function public.sweep_stale_cv_upload_jobs(integer) to service_role" in sql


def test_cv_upload_status_policy_is_owned_and_nonanonymous() -> None:
    sql = POLICY_MIGRATION.read_text(encoding="utf-8").lower()

    assert "to authenticated" in sql
    assert "(select auth.uid()) = user_id" in sql
    assert "(select auth.jwt())" in sql
    assert "is_anonymous" in sql
