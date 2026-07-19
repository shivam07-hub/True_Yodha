from pathlib import Path


MIGRATION = Path("database/migrations/20260720010000_cv_skill_confirmation_gate.sql")


def test_migration_adds_baseline_scoped_skill_confirmation_gate() -> None:
    sql = MIGRATION.read_text()

    assert "skills_detected JSONB NOT NULL DEFAULT '[]'::jsonb" in sql
    assert "skills_confirmed_at TIMESTAMPTZ" in sql
    assert "WHERE kind = 'baseline_upload'" in sql
    assert "skills_confirmed_at IS NULL" in sql
    assert "CREATE OR REPLACE FUNCTION public.confirm_cv_skills" in sql
    assert "DELETE FROM public.user_skills" in sql
    assert "GRANT EXECUTE ON FUNCTION public.confirm_cv_skills" in sql
