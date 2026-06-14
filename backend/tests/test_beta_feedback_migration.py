from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "database"
    / "migrations"
    / "20260614_intern_beta_feedback_submission.sql"
)


def test_beta_feedback_migration_enforces_one_submission_per_user() -> None:
    sql = MIGRATION.read_text()

    assert "CREATE UNIQUE INDEX IF NOT EXISTS" in sql
    assert "idx_user_feedback_intern_beta_assignment_v1_user" in sql
    assert "ON public.user_feedback (user_id)" in sql
    assert "payload->>'program' = 'intern_beta_assignment_v1'" in sql
    assert "user_id IS NOT NULL" in sql
    assert "type = 'feedback'" in sql


def test_beta_feedback_migration_refreshes_postgrest_schema() -> None:
    assert "NOTIFY pgrst, 'reload schema';" in MIGRATION.read_text()
