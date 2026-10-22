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


MIGRATIONS = Path(__file__).parents[2] / "database" / "migrations"


def _latest_sweep_definition() -> tuple[str, str]:
    """The newest migration that defines the sweep is the one live on the DB."""
    defining = sorted(
        path for path in MIGRATIONS.glob("*.sql")
        if "function public.sweep_stale_cv_upload_jobs" in path.read_text(encoding="utf-8").lower()
    )
    latest = defining[-1]
    return latest.name, latest.read_text(encoding="utf-8").lower()


def test_the_orphan_sweep_refunds_what_the_ledger_charged() -> None:
    """UP1: the sweep refunded `cv_upload_jobs.xp_charged`, which the worker
    stamps after the charge. A job swept between the two was charged 200,
    refunded 0 and marked refunded (2026-06-20). The ledger is the charge."""
    name, sql = _latest_sweep_definition()
    body = sql[sql.index("function public.sweep_stale_cv_upload_jobs"):sql.index("$$;")]

    assert name == "20261022120000_cv_upload_sweep_refunds_the_ledger.sql", name
    assert "from public.coin_ledger as l" in body
    assert "l.ref_table = 'cv_upload_jobs'" in body
    assert "l.ref_id = stale_job.id::text" in body
    assert "xp_charged" not in body, "the stamped copy must not decide the refund"
    assert "perform public.refund_coins(" in body
    assert "security definer" in sql
    assert "set search_path = ''" in sql
    assert "revoke all on function public.sweep_stale_cv_upload_jobs(integer) from public" in sql
    assert "grant execute on function public.sweep_stale_cv_upload_jobs(integer) to service_role" in sql
