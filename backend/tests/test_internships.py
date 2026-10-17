from datetime import datetime, timezone

import pytest

from app.schemas.jobs import JobFeedItem
from app.services.internships import (
    UnpaidInternshipError,
    hosted_job_row,
    intern_card,
    is_intern_job,
    require_paid,
    without_dismissed,
)


NOW = datetime(2026, 10, 15, tzinfo=timezone.utc)


def test_unpaid_hosted_internships_are_refused() -> None:
    with pytest.raises(UnpaidInternshipError):
        require_paid(0, 0)
    with pytest.raises(UnpaidInternshipError):
        hosted_job_row(
            "user-1",
            {
                "company_name": "Campus Co",
                "job_title": "Product intern",
                "stipend_low_inr": 0,
                "duration_months": 3,
                "job_description": "Work with the product team on live listings.",
            },
            now=NOW,
        )


def test_hosted_row_is_a_paid_myro_internship() -> None:
    row = hosted_job_row(
        "user-1",
        {
            "company_name": "Campus Co",
            "job_title": "Product intern",
            "stipend_low_inr": 8000,
            "stipend_high_inr": 12000,
            "duration_months": 3,
            "ppo": True,
            "location": "Bengaluru",
            "location_mode": "hybrid",
            "job_description": "Work with the product team on live listings.",
            "skills": ["SQL", "Figma"],
        },
        now=NOW,
    )
    assert row["listing_venue"] == "myro"
    assert row["employment_kind"] == "internship"
    assert row["stipend_low_inr"] == 8000
    assert row["stipend_high_inr"] == 12000
    assert row["duration_months"] == 3
    assert row["ppo"] is True
    assert row["listing_confidence"] == "active"
    assert row["job_id"].startswith("myro_")
    assert row["created_by_user_id"] == "user-1"


def test_intern_detection_from_title_and_band() -> None:
    assert is_intern_job({"job_title": "SDE Intern"})
    assert is_intern_job({"job_title": "Analyst", "seniority_level": "intern"})
    assert is_intern_job({"job_title": "Analyst", "employment_kind": "internship"})
    assert not is_intern_job({"job_title": "Data Analyst"})


def test_intern_card_carries_stipend_not_career_band() -> None:
    card = intern_card(
        {
            "job_id": "myro_abc",
            "job_title": "Product intern",
            "company_name": "Campus Co",
            "listing_venue": "myro",
            "employment_kind": "internship",
            "stipend_low_inr": 5000,
            "stipend_high_inr": 10000,
            "duration_months": 3,
            "ppo": True,
            "listing_confidence": "active",
            "is_active": True,
            "first_seen": 20261015,
            "last_verified_live_at": NOW.isoformat(),
            "last_conclusive_verification_at": NOW.isoformat(),
            "main_skills": ["SQL"],
        },
        now=NOW,
    )
    assert "career_band" not in card
    assert card["listing_venue"] == "myro"
    assert card["stipend_low_inr"] == 5000
    assert card["skills"] == ["SQL"]
    assert card["is_stale"] is False
    item = JobFeedItem(**card)
    assert item.listing_venue == "myro"
    assert item.stipend_low_inr == 5000


def test_without_dismissed_drops_skipped_interns() -> None:
    cards = [{"job_id": "keep"}, {"job_id": "gone"}]
    assert without_dismissed(cards, {"gone"}) == [{"job_id": "keep"}]
    assert without_dismissed(cards, set()) == cards
