from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"


def _migration(name: str) -> str:
    return (MIGRATIONS / name).read_text(encoding="utf-8")


def test_cv_upload_orphan_sweep_migration_qualifies_user_id_outputs() -> None:
    sql = _migration("20260525_fix_cv_upload_orphan_sweep.sql").lower()

    assert "returns table (job_id uuid, swept_user_id uuid, refunded_amount integer)" in sql
    assert "swept_user_id := stale_job.user_id;" in sql
    assert "select c.id, c.user_id, c.xp_charged" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_job_import_contract_migration_reasserts_created_by_user_id() -> None:
    sql = _migration("20260525_reassert_job_import_schema_contract.sql").lower()

    assert "alter table public.jobs" in sql
    assert "add column if not exists created_by_user_id uuid" in sql
    assert "references public.user_profiles(id) on delete set null" in sql
    assert "idx_jobs_created_by_user" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_referral_reward_migration_is_atomic_and_referral_scoped() -> None:
    sql = _migration("20260612_referral_reward_credit.sql").lower()

    assert "create or replace function public.reward_xp" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "for update" in sql
    assert "uq_xp_ledger_referral_signup_reward" in sql
    assert "action = 'referral_credit'" in sql
    assert "ref_table = 'referred_signup'" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_growth_command_migration_creates_private_generic_tables() -> None:
    sql = _migration("20260613_growth_command_phase1.sql").lower()
    tables = (
        "growth_operators",
        "growth_content_assets",
        "growth_campaigns",
        "growth_messages",
        "growth_publications",
        "growth_attribution_touchpoints",
        "growth_outreach_contacts",
        "growth_email_queue",
    )

    for table in tables:
        assert f"create table if not exists public.{table}" in sql
        assert f"alter table public.{table} enable row level security;" in sql

    assert "create policy" not in sql
    assert "unique (user_id, touch_kind)" in sql
    assert "unique (campaign_id, channel, variant)" in sql
    assert "legacy_key text unique" in sql
    assert "metadata jsonb not null default '{}'::jsonb" in sql
    assert "notify pgrst, 'reload schema';" in sql
