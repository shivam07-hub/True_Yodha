from pathlib import Path


MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813090000_read_path_closeout.sql"
)
SCHEDULE_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813091000_verifier_schedule_read_model.sql"
)
DIAGNOSTICS_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813092000_verifier_diagnostics_schedule.sql"
)
PAYLOAD_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813092500_verifier_schedule_payload.sql"
)
INDEX_CLEANUP_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813092700_verifier_interest_index_cleanup.sql"
)
TRIGGER_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813092900_verifier_interest_constant_time_triggers.sql"
)
FEED_INDEX_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813094100_feed_active_index_predicate.sql"
)
FEED_CONTEXT_MIGRATION = (
    Path(__file__).parents[2]
    / "database/migrations/20260813095000_feed_context_read_model.sql"
)


def test_verifier_priority_is_an_incremental_read_model() -> None:
    sql = MIGRATION.read_text()

    assert "CREATE TABLE IF NOT EXISTS public.job_verification_interest" in sql
    assert "CREATE TRIGGER sync_job_verification_interest_applications" in sql
    assert "CREATE TRIGGER sync_job_verification_interest_exposures" in sql
    assert "CREATE TRIGGER sync_job_verification_interest_matches" in sql

    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_verify_targets", 1)[1].split(
        "CREATE OR REPLACE FUNCTION public.count_new_jobs_for_user", 1
    )[0]
    assert "FROM public.job_verification_interest" in claim
    assert "FROM public.job_recommendation_exposures" not in claim
    assert "FROM public.user_job_matches" not in claim
    assert "FROM public.job_applications" not in claim
    assert "FOR UPDATE OF j SKIP LOCKED" in claim


def test_new_inventory_count_is_one_service_role_rpc() -> None:
    sql = MIGRATION.read_text()

    assert "FUNCTION public.count_new_jobs_for_user(p_user_id uuid)" in sql
    assert "p.last_match_run_at" in sql
    assert "max(m.computed_at)" in sql
    assert "j.ingested_at > m.ran_at" in sql
    assert "REVOKE ALL ON FUNCTION public.count_new_jobs_for_user(uuid)" in sql
    assert "GRANT EXECUTE ON FUNCTION public.count_new_jobs_for_user(uuid)" in sql


def test_verifier_claim_updates_only_the_narrow_schedule() -> None:
    sql = SCHEDULE_MIGRATION.read_text()
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_verify_targets", 1)[1]

    assert "CREATE TABLE IF NOT EXISTS public.job_verification_schedule" in sql
    assert "FOR UPDATE OF s SKIP LOCKED" in claim
    assert "UPDATE public.job_verification_schedule s" in claim
    assert "UPDATE public.jobs" not in claim
    assert "sync_job_verification_schedule_jobs" in sql


def test_verifier_diagnostics_do_not_scan_jobs_or_priority_sources() -> None:
    sql = DIAGNOSTICS_MIGRATION.read_text()

    assert "FROM public.job_verification_schedule" in sql
    assert "JOIN public.job_verification_schedule" in sql
    assert "FROM public.jobs" not in sql
    assert "FROM public.job_recommendation_exposures" not in sql
    assert "FROM public.job_applications" not in sql
    assert "FROM public.user_job_matches" not in sql
    assert "'priority_due', NULL" in sql


def test_verifier_claim_is_fully_served_by_narrow_read_models() -> None:
    sql = PAYLOAD_MIGRATION.read_text()
    claim = sql.split("CREATE OR REPLACE FUNCTION public.claim_verify_targets", 1)[1]

    assert "ADD COLUMN IF NOT EXISTS job_title" in sql
    assert "s.job_title" in claim
    assert "s.apply_url" in claim
    assert "s.listing_confidence" in claim
    assert "public.jobs" not in claim


def test_unused_interest_indexes_are_removed_after_live_plan_check() -> None:
    sql = INDEX_CLEANUP_MIGRATION.read_text()

    assert "idx_job_verification_interest_shown" in sql
    assert "idx_job_verification_interest_application" in sql
    assert "idx_job_verification_interest_matched" in sql


def test_hot_priority_writes_are_constant_time_upserts() -> None:
    sql = TRIGGER_MIGRATION.read_text()
    exposure = sql.split(
        "CREATE OR REPLACE FUNCTION public.sync_job_verification_interest_exposure", 1
    )[1].split(
        "CREATE OR REPLACE FUNCTION public.sync_job_verification_interest_application", 1
    )[0]

    assert "NEW.shown_at + interval '30 days'" in exposure
    assert "ON CONFLICT (job_id) DO UPDATE" in exposure
    assert "refresh_job_verification_interest(NEW.job_id)" not in exposure
    assert "sync_job_verification_interest_application" in sql
    assert "sync_job_verification_interest_match" in sql


def test_feed_read_model_collapses_context_hops_and_indexes_j0_order() -> None:
    context_sql = FEED_CONTEXT_MIGRATION.read_text()
    index_sql = FEED_INDEX_MIGRATION.read_text()

    assert "current_user_feed_context" in context_sql
    assert "auth.uid()" in context_sql
    assert "security invoker" in context_sql
    assert "grant execute" in context_sql
    assert "idx_jobs_feed_active_first_seen" in index_sql
    assert "where is_active = true and listing_confidence = 'active'" in index_sql
