from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"


def _migration(name: str) -> str:
    return (MIGRATIONS / name).read_text(encoding="utf-8")


def test_job_description_search_migration_adds_trgm_index() -> None:
    sql = _migration("20260629_job_description_search_index.sql").lower()

    assert "create extension if not exists pg_trgm" in sql
    assert "idx_jobs_job_description_trgm" in sql
    assert "using gin" in sql
    assert "job_description" in sql
    assert "gin_trgm_ops" in sql
    assert "notify pgrst, 'reload schema';" in sql


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


def test_reward_scope_migration_is_user_scoped_and_keeps_referrals_global() -> None:
    sql = _migration("20260613_reward_xp_user_scope.sql").lower()

    assert "uq_xp_ledger_user_reward_ref" in sql
    assert "on public.xp_ledger (user_id, action, ref_table, ref_id)" in sql
    assert "v_global_referral" in sql
    assert "p_user_id::text" in sql
    assert "v_global_referral or user_id = p_user_id" in sql
    assert "action = 'referral_credit'" in sql
    assert "ref_table = 'referred_signup'" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_coins_rename_contract_flips_authority_and_drops_xp() -> None:
    sql = _migration("20260622_coins_rename_contract.sql").lower()

    # Single all-or-nothing transaction.
    assert "begin;" in sql
    assert "commit;" in sql

    # Drops the EXPAND-phase generated read-aliases (they block the rename).
    assert "drop column if exists coin_balance" in sql
    assert "drop column if exists welcome_coins_granted" in sql
    assert "drop column if exists linkedin_coins_granted" in sql

    # Renames the physical columns + ledger table to coin_*.
    assert "rename column xp_balance         to coin_balance" in sql
    assert "rename column welcome_xp_granted  to welcome_coins_granted" in sql
    assert "rename column linkedin_xp_granted to linkedin_coins_granted" in sql
    assert "alter table public.xp_ledger rename to coin_ledger" in sql

    # Recreates the mutation RPCs as real coin-named fns, bodies on coin_*.
    assert "create or replace function public.charge_coins" in sql
    assert "create or replace function public.refund_coins" in sql
    assert "create or replace function public.reward_coins" in sql
    assert "set    coin_balance = coin_balance - p_amount" in sql
    assert "insert into public.coin_ledger" in sql

    # Sweep now refunds via refund_coins (kept fn name).
    assert "perform public.refund_coins(" in sql

    # Drops the orphaned xp_* mutation fns last.
    assert "drop function if exists public.charge_xp" in sql
    assert "drop function if exists public.refund_xp" in sql
    assert "drop function if exists public.reward_xp" in sql

    # No literal xp_balance / xp_ledger writes survive in the new fn bodies.
    assert "xp_balance =" not in sql
    assert "into public.xp_ledger" not in sql

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
        "growth_seeding_sweeps",
    )

    for table in tables:
        assert f"create table if not exists public.{table}" in sql
        assert f"alter table public.{table} enable row level security;" in sql

    assert "create policy" not in sql
    assert "unique (user_id, touch_kind)" in sql
    assert "unique (campaign_id, channel, variant)" in sql
    assert "legacy_key text unique" in sql
    assert "metadata jsonb not null default '{}'::jsonb" in sql
    assert "final_copy_snapshot text not null" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_growth_tracker_parity_migration_is_additive_and_private() -> None:
    sql = _migration("20260613_growth_tracker_parity.sql").lower()

    assert "create table if not exists public.growth_seeding_sweeps" in sql
    assert "alter table public.growth_seeding_sweeps enable row level security;" in sql
    assert "add column if not exists final_copy_snapshot text" in sql
    assert "update public.growth_publications gp" in sql
    assert "alter column final_copy_snapshot set not null" in sql
    assert "create policy" not in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_first_seen_is_written_once_migration_preserves_the_old_value() -> None:
    sql = _migration("20260920090000_first_seen_is_written_once.sql").lower()

    # The guard is the assignment, not the comment above it: a re-observation
    # may move `last_seen`, never the discovery date.
    assert "new.first_seen := old.first_seen;" in sql
    assert "if old.first_seen is not null then" in sql
    # UPDATE-only and column-scoped, so the verifier's lifecycle writes and the
    # enrichment path never pay for it, and INSERT still records discovery.
    assert "before update of first_seen on public.jobs" in sql
    assert "create trigger preserve_job_first_seen" in sql
    assert "for each row" in sql
    # Coerce, never raise: the crawler sends this column on every row, so a
    # raising guard would fail live crawls instead of ignoring a bad payload.
    assert "raise exception" not in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_retrieval_migration_filters_before_it_ranks() -> None:
    """The defect it replaces: the feed sampled 500 rows by a date 88% of the
    corpus shared, then filtered them for the user. Recall was 0%."""
    sql = _migration("20260924120000_retrieval_searches_instead_of_sampling.sql").lower()

    # Filter first, over the whole corpus — no cap before the predicates.
    assert "create or replace function public.candidates_for_user" in sql
    assert "j.career_band = any(v_bands)" in sql
    assert "limit greatest(p_limit, 0)" in sql

    # The level rule is a RANGE OVERLAP on both sides. An unstated bound spans
    # [0,40] so an untagged listing stays a candidate — 9,323 live listings
    # state no level and hiding them is what emptied a user's feed.
    assert "coalesce(p.lo, 0)::numeric <= v_hi" in sql
    assert "coalesce(p.hi, 40)::numeric >= v_lo" in sql

    # Where the employer states NO range, the seniority tag is the only signal
    # in the listing. Ignoring it put nine senior roles in a 3.5-year list.
    assert "v_senior_tags" in sql
    assert "p.lo is null and p.hi is null" in sql

    # An untagged career_band is a tagger that did not run, not a job in another
    # field: 1,557 live listings were invisible to every user because an array
    # equality never matches NULL. Two index-backed branches, never an OR — that
    # predicate is exactly the one the planner cannot prove.
    assert "j.career_band is null and j.role_family = any(v_families)" in sql
    assert "union all" in sql

    # Unknown years falls back to the BAND, never to no rule: that put an 8-14
    # year role and a VP requisition in a 3.2-year candidate's top three.
    assert "('mid', 2, 5)" in sql
    assert "v_lo := v_years - 1" in sql

    # Shape rules a hand-built shortlist already followed.
    assert "per_company <= v_per_company" in sql
    assert "same_title = 1" in sql

    # PL/pgSQL locals, not scalar subqueries: the subquery form left the partial
    # index unused at 37,874 buffers.
    #
    # Checked against CODE lines only. The first version of this assertion read
    # the whole file and tripped on the comment that explains the very pattern
    # it forbids — a grep contract test failing on its own prose.
    code = "\n".join(
        line for line in sql.splitlines() if not line.strip().startswith("--")
    )
    assert "language plpgsql" in code
    assert "cardinality(bands)=0 or" not in code

    assert "notify pgrst, 'reload schema';" in sql


def test_retrieval_ranks_direction_from_skills_not_the_bucket() -> None:
    """ADR-0022: role_family may recall a job. It may not tag it or add rank.
    The live function is the later migration; the 20260924 body is history."""
    sql = _migration("20260925223000_direction_grade_not_bucket.sql").lower()
    code = "\n".join(
        line for line in sql.splitlines() if not line.strip().startswith("--")
    )
    assert "create or replace function public.candidates_for_user" in code
    assert "then 6 else 0" not in code
    assert "(c.role_family = any(v_families)) as on_dir" not in code
    assert "null::boolean as on_dir" in code
    # Recall stays indexed equality.
    assert "j.career_band is null and j.role_family = any(v_families)" in code
    assert "or c.role_family = any(v_families)" in code
    assert "notify pgrst, 'reload schema';" in sql
