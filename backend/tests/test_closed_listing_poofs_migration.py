from pathlib import Path


SQL = (
    Path(__file__).parents[2]
    / "database/migrations/20260914120000_closed_listing_poofs.sql"
).read_text()


def test_a_dead_link_report_closes_the_listing() -> None:
    closed = SQL.split("ELSIF observation_result = 'closed' THEN", 1)[1].split("ELSE", 1)[0]
    assert "listing_confidence = 'closed'" in closed
    assert "is_active = FALSE" in closed
    assert "deletion_eligible_at" in closed
    assert "'likely_closed'" not in closed


def test_the_poof_pings_once_then_drops_apply_intents() -> None:
    assert "'listing_vanished'" in SQL
    assert "DELETE FROM public.job_apply_intents" in SQL
    assert "'/market'" in SQL
    assert "COALESCE(a.status, 'saved') <> 'saved'" in SQL


def test_already_dead_rows_do_not_ping_on_backfill() -> None:
    trigger_at = SQL.index("CREATE TRIGGER trg_poof_closed_listing")
    backfill_at = SQL.index("listing_confidence = 'likely_closed'")
    assert backfill_at < trigger_at
    assert "set_config('session_replication_role'" not in SQL
    assert "consecutive_complete_misses >= 1" in SQL
