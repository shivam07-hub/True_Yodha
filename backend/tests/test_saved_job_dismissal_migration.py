from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


def _migration_sql() -> str:
    matches = sorted(MIGRATIONS.glob("*_dismiss_saved_job_atomic.sql"))
    assert matches, "dismiss_saved_job_atomic migration is missing"
    return matches[-1].read_text()


def _rls_migration_sql() -> str:
    matches = sorted(MIGRATIONS.glob("*_saved_job_dismissal_rls.sql"))
    assert matches, "saved_job_dismissal_rls migration is missing"
    return matches[-1].read_text()


def _anonymous_guard_migration_sql() -> str:
    matches = sorted(MIGRATIONS.glob("*_deny_anonymous_saved_job_dismissal.sql"))
    assert matches, "deny_anonymous_saved_job_dismissal migration is missing"
    return matches[-1].read_text()


def _jwt_initplan_migration_sql() -> str:
    matches = sorted(MIGRATIONS.glob("*_saved_job_dismissal_jwt_initplan.sql"))
    assert matches, "saved_job_dismissal_jwt_initplan migration is missing"
    return matches[-1].read_text()


def test_saved_job_dismissal_is_atomic_and_preserves_history() -> None:
    sql = _migration_sql().lower()

    assert "create or replace function public.dismiss_saved_job" in sql
    assert "security invoker" in sql
    assert "auth.uid()" in sql
    assert "status = 'saved'" in sql
    assert "delete from public.job_applications" in sql
    assert "insert into public.user_dismissed_job_cards" in sql
    assert "delete from public.user_job_matches" not in sql
    assert "revoke all on function public.dismiss_saved_job" in sql
    assert "grant execute on function public.dismiss_saved_job" in sql


def test_submitted_applications_cannot_be_dismissed() -> None:
    sql = _migration_sql().lower()

    assert "saved application not found" in sql
    assert "raise exception" in sql


def test_undo_restores_the_saved_intent_from_its_database_snapshot() -> None:
    sql = _migration_sql().lower()

    assert "add column if not exists prior_application jsonb" in sql
    assert "returning to_jsonb" in sql
    assert "create or replace function public.restore_saved_job" in sql
    assert "insert into public.job_applications" in sql
    assert "delete from public.user_dismissed_job_cards" in sql
    assert "revoke all on function public.restore_saved_job" in sql
    assert "grant execute on function public.restore_saved_job" in sql


def test_saved_job_dismissal_policies_are_authenticated_and_initplan_safe() -> None:
    sql = _rls_migration_sql().lower()

    assert "to authenticated" in sql
    assert "(select auth.uid()) = user_id" in sql
    assert "revoke all on table public.user_dismissed_job_cards from public, anon" in sql
    assert "grant select, insert, update, delete" in sql


def test_anonymous_authenticated_users_cannot_change_saved_job_dismissals() -> None:
    sql = _anonymous_guard_migration_sql().lower()

    assert "auth.jwt() ->> 'is_anonymous'" in sql
    assert "is false" in sql
    assert sql.count("to authenticated") == 4


def test_anonymous_claim_is_evaluated_once_per_statement() -> None:
    sql = _jwt_initplan_migration_sql().lower()

    assert "(select auth.jwt()) ->> 'is_anonymous'" in sql
    assert sql.count("to authenticated") == 4
