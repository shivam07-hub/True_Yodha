"""The newest receipt is one indexed read, not a sort under the caller's policy."""

from pathlib import Path

MIGRATION = (
    Path(__file__).parents[2] / "database/migrations/20261102121500_newest_job_receipt.sql"
)


def test_the_newest_receipt_is_a_definer_max() -> None:
    sql = MIGRATION.read_text()

    assert "create index if not exists idx_jobs_ingested_at" in sql
    assert "function public.newest_job_receipt()" in sql
    assert "security definer" in sql
    assert "select max(j.ingested_at) from public.jobs j" in sql
    assert "revoke all on function public.newest_job_receipt() from public, anon" in sql
    assert "grant execute on function public.newest_job_receipt() to authenticated, service_role" in sql
