"""A filing Yes is stored only for a confirmed-open, judged, tailored role.

The cases are the ones that would otherwise spend a CV on a dead ad, an
unjudged role, or a master CV that was never written for this job.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.services.apply_filing import (
    BELOW_JUDGE,
    LISTING_CLOSED,
    LISTING_UNCONFIRMED,
    NO_TAILORED_CV,
    NO_YES,
    QUALIFIED_SCORE,
    RECEIPT_HOST,
    RECEIPT_TEXT,
    SIDE_ROLE_OVERLAP,
    STALE_CV,
    FilingFacts,
    decide,
    receipt_block,
    with_stored_cv,
)
from app.services.listing_time import CONFIRM_WITHIN

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
ROOT = Path(__file__).resolve().parents[2]


def _live(**overrides: object) -> dict:
    at = (NOW - timedelta(days=1)).isoformat()
    row: dict = {
        "is_active": True,
        "listing_confidence": "active",
        "first_seen": 20261014,
        "ingested_at": at,
        "last_verified_live_at": at,
        "last_conclusive_verification_at": at,
        "reactivated_at": at,
    }
    row.update(overrides)
    return row


def _facts(**overrides: object) -> FilingFacts:
    base = {
        "listing": _live(),
        "judge_score": QUALIFIED_SCORE,
        "tailored_cv_id": 12,
        "cv_experience": (),
    }
    base.update(overrides)
    return FilingFacts(
        listing=base["listing"],  # type: ignore[arg-type]
        judge_score=base["judge_score"],
        tailored_cv_id=base["tailored_cv_id"],
        cv_experience=base["cv_experience"],
    )


def test_a_confirmed_open_judged_tailored_role_can_be_approved() -> None:
    decision = decide(_facts(), now=NOW, yes=True)
    assert decision.ready is True
    assert decision.blocks == ()
    assert decision.cv_version_id == 12
    assert decision.judge_score == QUALIFIED_SCORE


def test_a_read_does_not_demand_the_yes() -> None:
    decision = decide(_facts(), now=NOW, yes=None)
    assert decision.ready is True


def test_refusing_the_yes_blocks_even_when_the_role_is_ready() -> None:
    decision = decide(_facts(), now=NOW, yes=False)
    assert decision.ready is False
    assert decision.blocks == (NO_YES,)


def test_a_crawler_sighting_is_not_a_confirmation() -> None:
    """The feed re-stamps last_verified_live_at without a conclusive check."""
    listing = _live(
        last_conclusive_verification_at=None,
        reactivated_at=None,
    )
    decision = decide(_facts(listing=listing), now=NOW, yes=True)
    assert decision.ready is False
    assert LISTING_UNCONFIRMED in decision.blocks


def test_a_check_older_than_the_confirm_window_is_unconfirmed() -> None:
    at = (NOW - CONFIRM_WITHIN - timedelta(hours=1)).isoformat()
    listing = _live(
        last_verified_live_at=at,
        last_conclusive_verification_at=at,
        reactivated_at=at,
    )
    decision = decide(_facts(listing=listing), now=NOW, yes=True)
    assert LISTING_UNCONFIRMED in decision.blocks
    assert decision.ready is False


def test_a_side_role_dated_across_a_full_time_seat_is_not_ready() -> None:
    experience = [
        {"role": "Consultant", "company": "Capgemini", "dates": "2021 - 2023"},
        {"role": "Analyst", "company": "Finlatics", "dates": "2022 - 2022"},
    ]
    decision = decide(_facts(cv_experience=experience), now=NOW, yes=True)
    assert decision.ready is False
    assert SIDE_ROLE_OVERLAP in decision.blocks


def test_dated_non_overlapping_roles_stay_ready() -> None:
    experience = [
        {"role": "Analyst", "company": "Acme", "dates": "2020 - 2021"},
        {"role": "Lead", "company": "Beta", "dates": "2022 - 2024"},
    ]
    decision = decide(_facts(cv_experience=experience), now=NOW, yes=True)
    assert decision.ready is True
    assert SIDE_ROLE_OVERLAP not in decision.blocks


def test_a_closed_listing_is_named_closed_even_with_a_recent_check() -> None:
    decision = decide(
        _facts(listing=_live(listing_confidence="closed")),
        now=NOW,
        yes=True,
    )
    assert decision.blocks[0] == LISTING_CLOSED
    assert decision.ready is False


def test_below_the_qualified_floor_and_a_missing_cv_are_both_named() -> None:
    decision = decide(
        _facts(judge_score=3.49, tailored_cv_id=None),
        now=NOW,
        yes=True,
    )
    assert decision.blocks == (BELOW_JUDGE, NO_TAILORED_CV)
    assert decision.ready is False


def test_an_unjudged_role_is_below_the_floor() -> None:
    decision = decide(_facts(judge_score=None), now=NOW, yes=True)
    assert BELOW_JUDGE in decision.blocks


def test_the_score_arrives_as_text_from_the_database() -> None:
    decision = decide(_facts(judge_score="4.2"), now=NOW, yes=True)
    assert decision.ready is True
    assert decision.judge_score == 4.2


def test_a_newer_cv_makes_the_stored_yes_stale() -> None:
    decision = decide(_facts(tailored_cv_id=12), now=NOW, yes=True)
    current = with_stored_cv(decision, 9)
    assert current.ready is False
    assert STALE_CV in current.blocks


def test_the_same_cv_keeps_the_yes() -> None:
    decision = decide(_facts(tailored_cv_id=9), now=NOW, yes=True)
    assert with_stored_cv(decision, 9).ready is True


def test_a_receipt_from_another_site_is_refused() -> None:
    block = receipt_block(
        urls=["https://careers.example.com/jobs/1"],
        receipt_url="https://linkedin.com/jobs/view/1",
        receipt_text="Application submitted. Thank you.",
    )
    assert block == RECEIPT_HOST


def test_a_receipt_on_the_company_host_is_accepted() -> None:
    block = receipt_block(
        urls=["https://www.careers.example.com/jobs/1"],
        receipt_url="https://careers.example.com/apply/thanks",
        receipt_text="Application submitted. Thank you.",
    )
    assert block is None


def test_a_short_confirmation_is_refused() -> None:
    block = receipt_block(
        urls=["https://careers.example.com/jobs/1"],
        receipt_url="https://careers.example.com/thanks",
        receipt_text="Thanks",
    )
    assert block == RECEIPT_TEXT


def test_filing_migration_keeps_insert_off_the_browser_role() -> None:
    sql = (
        ROOT / "database" / "migrations" / "20261015190000_job_filing_authorizations.sql"
    ).read_text(encoding="utf-8").lower()
    assert "create table if not exists public.job_filing_authorizations" in sql
    assert "judge_score >= 3.5" in sql
    assert "revoke insert, update, delete" in sql
    assert "grant select on public.job_filing_authorizations to authenticated" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_receipt_migration_names_the_confirmation_and_the_intake() -> None:
    sql = (
        ROOT / "database" / "migrations" / "20261015193000_job_filing_receipt.sql"
    ).read_text(encoding="utf-8").lower()
    assert "receipt_url" in sql
    assert "receipt_text" in sql
    assert "received_at" in sql
    assert "hold_reason" in sql
    assert "create table if not exists public.filing_intakes" in sql
    assert "revoke insert, update, delete on public.filing_intakes" in sql
    assert "notify pgrst, 'reload schema';" in sql


def test_resume_migration_stores_the_sheet_and_names_the_hold() -> None:
    sql = (
        ROOT / "database" / "migrations" / "20261015200000_filing_resume.sql"
    ).read_text(encoding="utf-8").lower()
    assert "add column if not exists resume_pdf text" in sql
    assert "resume_filename" in sql
    assert "'resume'" in sql
    assert "char_length(resume_pdf) <= 2000000" in sql
    assert "notify pgrst, 'reload schema';" in sql
