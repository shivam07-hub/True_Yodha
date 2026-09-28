"""Close proof for the /market list's 500.

`published_list._card` handed `jobs.first_seen` — a YYYYMMDD integer — to
`JobFeedItem.first_seen`, a string, so /jobs/feed returned 500 to every user
with a kept job. The card now reads its listing time from `ListingTime.card()`.
"""
from __future__ import annotations

NOTICE_CAUSE_KEY = "unhandled_500:ValidationError:app/routers/jobs/list.py:<listcomp>"


def test_a_kept_job_is_a_valid_card() -> None:
    from app.schemas.jobs import JobFeedItem
    from app.services.matching.published_list import _card

    card = JobFeedItem(**_card({
        "job_id": "j1",
        "overall_score": 4.2,
        "recommendation": "Apply",
        "jobs": {
            "job_title": "Data Analyst",
            "first_seen": 20260915,
            "last_seen": 20260915,
            "is_active": True,
            "listing_confidence": "active",
            "last_verified_live_at": None,
        },
    }))

    assert card.first_seen == "2026-09-15"
    assert card.last_seen_at is None
    # Never checked is not confirmed open.
    assert card.is_stale is True

