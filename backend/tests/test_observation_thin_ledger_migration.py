from pathlib import Path


MIGRATIONS = Path(__file__).parents[2] / "database/migrations"
THIN = (MIGRATIONS / "20260915181000_observation_thin_ledger.sql").read_text()
VACUUM = (MIGRATIONS / "20260915181100_observation_thin_ledger_vacuum.sql").read_text()


def test_the_delete_keeps_closes_user_reports_and_one_scraper_ping() -> None:
    assert "observer = 'user'" in THIN
    assert "result = 'closed'" in THIN
    assert "keep_latest_seen_live" in THIN
    assert "keep_first_missing" in THIN
    assert "observer = 'scraper' AND result = 'seen_live'" in THIN
    assert "observer = 'scraper' AND result = 'source_missing'" in THIN


def test_feed_presence_uses_verified_live_not_ingest_last_seen() -> None:
    view = THIN.split("CREATE OR REPLACE VIEW public.listing_feed_presence")[1]
    view = view.split("COMMENT ON VIEW")[0]
    assert "last_verified_live_at" in view
    assert "last_seen" not in view
    assert "observer = 'scraper'" in view


def test_health_heartbeat_does_not_read_the_observation_diary() -> None:
    fn = THIN.split("CREATE OR REPLACE FUNCTION public.verifier_health_snapshot")[1]
    fn = fn.split("$$;")[0]
    assert "job_listing_observations" not in fn
    assert "last_conclusive_verification_at" in fn


def test_vacuum_rewrites_the_two_tables_outside_a_transaction() -> None:
    assert "BEGIN" not in VACUUM
    assert "VACUUM (FULL, ANALYZE) public.job_listing_observations;" in VACUUM
    assert "VACUUM (FULL, ANALYZE) public.jobs;" in VACUUM
