"""The three 2026-08-05 migrations behind the dead-listing report.

The schema-contract lesson: a payload field with no migration is invisible to
every gate and 500s at runtime. These assert the SQL that ships alongside the
code changes actually carries the contract the code depends on.
"""

from pathlib import Path

MIGRATIONS = Path(__file__).parents[2] / "database/migrations"
REPORT = (MIGRATIONS / "20260805_user_closed_report_writes_likely_closed.sql").read_text()
CONCLUSIVE = (MIGRATIONS / "20260805b_verification_conclusiveness.sql").read_text()
REOPEN = (MIGRATIONS / "20260805c_return_user_reported_listing.sql").read_text()


def test_a_user_closed_report_reaches_the_frontends_closed_predicate() -> None:
    """`uncertain` is invisible to the user; `likely_closed` is not.

    isPulseClosed() fires on closed | likely_closed only, so capping a report at
    `uncertain` meant the row never moved to the Collections "Closed" chip and
    the apply gate never armed — the report changed nothing anyone could see.
    """
    assert "ELSIF observation_result = 'closed' THEN" in REPORT
    assert "'likely_closed'" in REPORT


def test_one_report_never_retires_a_listing() -> None:
    """`closed` quarantines, retires and sets a deletion clock.

    One user's word is enough to stop recommending a listing, and nowhere near
    enough to delete it — the verifier still overrules on the next seen_live.
    """
    closed_branch = REPORT.split("ELSIF observation_result = 'closed' THEN")[1]
    closed_branch = closed_branch.split("ELSE")[0]
    for terminal in ("retired_at", "quarantined_at", "deletion_eligible_at", "is_active"):
        assert terminal not in closed_branch


def test_a_wrong_listing_is_not_a_dead_one() -> None:
    # redirected / wrong_role / error still land on `uncertain`.
    assert "'uncertain'" in REPORT


def test_freshness_has_a_column_that_only_a_verdict_can_stamp() -> None:
    assert "last_conclusive_verification_at" in CONCLUSIVE
    assert "consecutive_verify_failures" in CONCLUSIVE
    # Additive and safe on a live table — no rewrite, no NOT NULL without default.
    assert "ADD COLUMN IF NOT EXISTS" in CONCLUSIVE
    assert "DEFAULT 0" in CONCLUSIVE


def test_the_backfill_cannot_invent_a_verification() -> None:
    """Only rows with a real seen_live timestamp get a conclusive stamp."""
    assert "last_verified_live_at IS NOT NULL" in CONCLUSIVE
    assert "listing_confidence = 'active'" in CONCLUSIVE


def test_a_reopened_listing_goes_back_to_whoever_reported_it() -> None:
    assert "DELETE FROM public.user_dismissed_job_cards" in REOPEN
    assert "'listing_reopened'" in REOPEN
    # The bell routes on action_url before it looks at kind, so a new kind needs
    # no frontend change — but only if the trigger supplies one.
    assert "action_url" in REOPEN
    assert "'/cv?jobId='" in REOPEN


def test_the_reopen_hook_costs_nothing_on_the_ordinary_path() -> None:
    """Scoped to the one transition it exists for.

    A trigger on every jobs update would run through the whole verification
    sweep; this one fires only where the verifier overwrote a user's verdict.
    """
    assert "AFTER UPDATE OF listing_confidence" in REOPEN
    assert "OLD.confidence_reason = 'user_closed'" in REOPEN
    assert "NEW.listing_confidence = 'active'" in REOPEN
