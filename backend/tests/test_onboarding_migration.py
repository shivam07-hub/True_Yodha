from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


def _migration_sql() -> str:
    matches = list(MIGRATIONS.glob("*trustworthy_first_value_onboarding.sql"))
    assert len(matches) == 1, "expected one trustworthy onboarding migration"
    return matches[0].read_text()


def test_onboarding_migration_adds_profile_and_state_contracts() -> None:
    sql = _migration_sql()

    assert "ADD COLUMN IF NOT EXISTS target_role_title TEXT" in sql
    assert "ADD COLUMN IF NOT EXISTS target_seniority TEXT" in sql
    assert "CREATE TABLE IF NOT EXISTS public.user_onboarding_state" in sql
    assert "PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE" in sql
    assert "entry_mode TEXT" in sql
    assert "generator_answers JSONB" in sql
    assert "activated_at TIMESTAMPTZ" in sql


def test_onboarding_migration_adds_skill_override_contract() -> None:
    sql = _migration_sql()

    assert "CREATE TABLE IF NOT EXISTS public.cv_skill_overrides" in sql
    assert "baseline_version_id INTEGER NOT NULL" in sql
    assert "action TEXT NOT NULL CHECK (action IN ('include', 'exclude'))" in sql
    assert "UNIQUE (user_id, baseline_version_id, skill_id)" in sql


def test_onboarding_migration_extends_upload_and_match_context() -> None:
    sql = _migration_sql()

    assert "ADD COLUMN IF NOT EXISTS analysis_kind TEXT" in sql
    assert "ADD COLUMN IF NOT EXISTS result_payload JSONB" in sql
    assert "ADD COLUMN IF NOT EXISTS baseline_version_id INTEGER" in sql
    assert "ADD COLUMN IF NOT EXISTS target_context_hash TEXT" in sql
    assert "ADD COLUMN IF NOT EXISTS seniority_compatibility TEXT" in sql
    assert "recommendation = 'Skip'" in sql
    assert "is_recommended IS NOT TRUE" in sql


def test_onboarding_migration_enables_owner_rls_and_explicit_grants() -> None:
    sql = _migration_sql()

    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "TO authenticated" in sql
    assert "(SELECT auth.uid()) = user_id" in sql
    assert "(SELECT auth.jwt())->>'is_anonymous'" in sql
    assert "GRANT SELECT ON public.user_onboarding_state TO authenticated" in sql
    assert "GRANT SELECT ON public.cv_skill_overrides TO authenticated" in sql
    assert "REVOKE ALL ON public.user_onboarding_state FROM anon, authenticated" in sql
    assert "REVOKE ALL ON public.cv_skill_overrides FROM anon, authenticated" in sql
    assert "NOTIFY pgrst, 'reload schema';" in sql
