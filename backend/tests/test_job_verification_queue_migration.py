from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260711f_job_verification_queue_index.sql"
)


def test_verification_queue_has_covering_order_index() -> None:
    sql = MIGRATION.read_text()

    assert "idx_jobs_verification_queue" in sql
    assert "listing_confidence" in sql
    assert "last_verification_attempt_at ASC NULLS FIRST" in sql
    assert "INCLUDE (job_title, apply_url)" in sql
