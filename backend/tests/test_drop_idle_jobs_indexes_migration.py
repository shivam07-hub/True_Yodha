from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20261015140000_drop_idle_jobs_indexes.sql"
)

_DROPS = (
    "idx_jobs_verification_queue",
    "idx_jobs_verify_due",
    "idx_jobs_verify_pending",
    "idx_jobs_job_content_hash",
    "idx_jobs_has_summary",
)

_KEPT = (
    "idx_jobs_location_states_gin",
    "idx_jobs_deletion_eligible",
    "job_verification_schedule",
)


def test_idle_index_drop_is_concurrent_and_reversible() -> None:
    sql = MIGRATION.read_text()
    for name in _DROPS:
        assert f"DROP INDEX CONCURRENTLY IF EXISTS public.{name};" in sql
        assert f"CREATE INDEX {name} " in sql
    for name in _KEPT:
        assert f"DROP INDEX CONCURRENTLY IF EXISTS public.{name}" not in sql
