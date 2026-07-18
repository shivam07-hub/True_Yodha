from pathlib import Path


MIGRATIONS = Path(__file__).resolve().parents[2] / "database" / "migrations"


def _migration_sql() -> str:
    matches = sorted(MIGRATIONS.glob("*_job_apply_intent_contract.sql"))
    assert matches, "job_apply_intent_contract migration is missing"
    return matches[-1].read_text().lower()


def test_each_outbound_apply_action_is_an_identity_scoped_attempt() -> None:
    sql = _migration_sql()

    assert "create table if not exists public.job_apply_intents" in sql
    assert "add column if not exists client_event_id uuid" in sql
    assert "drop constraint if exists job_apply_intents_user_id_job_id_event_day_surface_key" in sql
    assert "unique (user_id, client_event_id)" in sql
    assert "create or replace function public.record_job_apply_intent" in sql
    assert "security invoker" in sql
    assert "auth.uid()" in sql
    assert "auth.jwt()" in sql
    assert "listing_confidence" in sql
    assert "last_verified_live_at" in sql
    assert "grant execute on function public.record_job_apply_intent" in sql


def test_apply_intent_contract_never_marks_an_application_submitted() -> None:
    sql = _migration_sql()

    assert "job_applications" not in sql
    assert "cv_application_attempts" not in sql
