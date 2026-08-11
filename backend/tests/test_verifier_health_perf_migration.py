from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260811190435_verifier_health_heartbeat_fast_path.sql"
)


def test_health_snapshot_is_an_indexed_heartbeat_not_a_backlog_count() -> None:
    sql = MIGRATION.read_text()
    body = sql.split("AS $$", 1)[1].split("$$;", 1)[0]

    assert "count_priority_verify_due" not in body
    assert "j.retired_at IS NULL" in body
    assert "ORDER BY j.last_verification_attempt_at DESC NULLS LAST" in body
    assert "ORDER BY o.observed_at DESC" in body
    assert body.count("LIMIT 1") == 2
    assert "'priority_due', NULL" in body


def test_health_snapshot_remains_service_role_only_and_backward_compatible() -> None:
    sql = MIGRATION.read_text()

    assert "CREATE OR REPLACE FUNCTION public.verifier_health_snapshot(" in sql
    assert "p_priority_stale interval DEFAULT '24 hours'" in sql
    assert "SET search_path = ''" in sql
    assert "REVOKE ALL ON FUNCTION public.verifier_health_snapshot(interval)" in sql
    assert "GRANT EXECUTE ON FUNCTION public.verifier_health_snapshot(interval)" in sql
