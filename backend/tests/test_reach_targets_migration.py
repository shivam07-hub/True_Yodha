"""reach_targets migration is additive, RLS own-only, and reloads PostgREST."""
from pathlib import Path

SQL = Path(__file__).resolve().parents[2] / "database/migrations/20260915180000_reach_targets.sql"


def test_reach_targets_migration_is_additive_and_own_only():
    sql = SQL.read_text()
    assert "CREATE TABLE IF NOT EXISTS public.reach_targets" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
    assert "auth.uid() = user_id" in sql
    assert "DROP TABLE" not in sql
    assert "NOTIFY pgrst, 'reload schema'" in sql
    assert "GRANT SELECT, INSERT, UPDATE, DELETE ON public.reach_targets TO authenticated" in sql
    assert "linkedin.com/in" in sql or "vanity" in sql.lower() or "Path 3" in sql
