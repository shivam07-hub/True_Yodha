from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"


def _migration(name: str) -> str:
    return (MIGRATIONS / name).read_text(encoding="utf-8")


def test_cv_upload_orphan_sweep_migration_qualifies_user_id_outputs() -> None:
    sql = _migration("20260525_fix_cv_upload_orphan_sweep.sql").lower()

    assert "returns table (job_id uuid, swept_user_id uuid, refunded_amount integer)" in sql
    assert "swept_user_id := stale_job.user_id;" in sql
    assert "select c.id, c.user_id, c.xp_charged" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_job_import_contract_migration_reasserts_created_by_user_id() -> None:
    sql = _migration("20260525_reassert_job_import_schema_contract.sql").lower()

    assert "alter table public.jobs" in sql
    assert "add column if not exists created_by_user_id uuid" in sql
    assert "references public.user_profiles(id) on delete set null" in sql
    assert "idx_jobs_created_by_user" in sql
    assert "notify pgrst, 'reload schema';" in sql
