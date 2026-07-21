from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260721071631_prioritize_user_relevant_job_verification.sql"
)


def test_user_relevant_claim_is_atomic_and_preserves_corpus_progress() -> None:
    sql = MIGRATION.read_text()

    assert "job_applications" in sql
    assert "job_recommendation_exposures" in sql
    assert "user_job_matches" in sql
    assert "(claim_limit * 4) / 5" in sql
    assert "global_due" in sql
    assert "FOR UPDATE OF j SKIP LOCKED" in sql
    assert "SET last_verification_attempt_at = now()" in sql


def test_priority_claim_has_tighter_freshness_and_audit_reason() -> None:
    sql = MIGRATION.read_text()

    assert "p_priority_stale interval DEFAULT '24 hours'" in sql
    assert "verification_priority text" in sql
    assert "WHEN 0 THEN 'tracked'" in sql
    assert "WHEN 1 THEN 'shown'" in sql
    assert "ELSE 'matched'" in sql


def test_health_snapshot_distinguishes_claims_from_productive_verdicts() -> None:
    sql = MIGRATION.read_text()

    assert "verifier_health_snapshot" in sql
    assert "last_productive" in sql
    assert "count_priority_verify_due" in sql
    assert "result IN ('seen_live', 'closed', 'redirected', 'wrong_role')" in sql


def test_new_rpcs_are_service_role_only() -> None:
    sql = MIGRATION.read_text()

    for signature in (
        "claim_verify_targets(int, interval, interval)",
        "count_priority_verify_due(interval)",
        "verifier_health_snapshot(interval)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{signature}" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{signature}" in sql

    assert sql.count("SET search_path = ''") == 3
