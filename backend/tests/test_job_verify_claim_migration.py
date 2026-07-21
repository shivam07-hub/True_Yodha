from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2] / "database/migrations/20260721_job_verify_claim.sql"
)


def test_claim_is_atomic_and_starvation_free() -> None:
    sql = MIGRATION.read_text()

    assert "claim_verify_targets" in sql
    # Read-and-stamp in one statement: the property that makes a crashed sweep
    # cost one batch instead of re-serving the same rows forever.
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "SET last_verification_attempt_at = now()" in sql
    assert "ORDER BY j.last_verification_attempt_at ASC NULLS FIRST" in sql


def test_queue_is_confidence_agnostic() -> None:
    """A row marked `active` must re-enter the queue once stale.

    Scoping the queue by listing_confidence is what let verified rows decay
    silently — this asserts the predicate never comes back.
    """
    sql = MIGRATION.read_text()
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_verify_targets")[1]
    body = claim.split("$$")[1]

    assert "listing_confidence IN" not in body
    assert "last_verification_attempt_at IS NULL" in body
    assert "retired_at IS NULL" in body


def test_due_index_covers_the_claim_scan() -> None:
    sql = MIGRATION.read_text()

    assert "idx_jobs_verify_due" in sql
    assert "last_verification_attempt_at ASC NULLS FIRST" in sql
    assert "INCLUDE (job_id, job_title, apply_url)" in sql


def test_queue_rpcs_are_service_role_only() -> None:
    sql = MIGRATION.read_text()

    assert "REVOKE ALL ON FUNCTION public.claim_verify_targets(int, interval) FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT EXECUTE ON FUNCTION public.claim_verify_targets(int, interval) TO service_role;" in sql
