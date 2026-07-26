from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database"
    / "migrations"
    / "20260726182212_feedback_submission_idempotency.sql"
)


def test_feedback_idempotency_migration_has_database_correctness_boundary() -> None:
    sql = MIGRATION.read_text(encoding="utf-8").lower()

    assert "idempotency_key uuid" in sql
    assert "idempotency_fingerprint text" in sql
    assert "unique index" in sql
    assert "on public.user_feedback (idempotency_key)" in sql
    assert "where idempotency_key is not null" in sql
    assert "char_length(idempotency_fingerprint) = 64" in sql
    assert "grant " not in sql
