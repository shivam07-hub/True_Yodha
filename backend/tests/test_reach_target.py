"""Reach Target — ADR-0018 Path 3: user-nominated URL + send-ledger transitions."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.reach_target import (
    FOLLOWUP_DAYS,
    MAX_TARGETS_PER_USER,
    can_advance,
    fill_first_name,
    is_due,
    parse_linkedin_profile_url,
)


def test_accepts_plain_and_https_in_urls():
    assert parse_linkedin_profile_url("https://www.linkedin.com/in/asha-rao") == (
        "https://www.linkedin.com/in/asha-rao"
    )
    assert parse_linkedin_profile_url("linkedin.com/in/asha-rao/") == (
        "https://www.linkedin.com/in/asha-rao"
    )
    assert parse_linkedin_profile_url("https://in.linkedin.com/in/asha_rao?trk=x") == (
        "https://www.linkedin.com/in/asha_rao"
    )


def test_rejects_search_salesnav_company_and_empty():
    assert parse_linkedin_profile_url("https://www.linkedin.com/search/results/people/?keywords=vp") is None
    assert parse_linkedin_profile_url("https://www.linkedin.com/sales/people/ABC") is None
    assert parse_linkedin_profile_url("https://www.linkedin.com/company/netscribes") is None
    assert parse_linkedin_profile_url("https://www.linkedin.com/in/") is None
    assert parse_linkedin_profile_url("https://example.com/in/asha") is None
    assert parse_linkedin_profile_url("javascript:alert(1)") is None
    assert parse_linkedin_profile_url("") is None


def test_fill_first_name_replaces_placeholder_only():
    assert fill_first_name("Hi {first name}, I lead marketing.", "Asha Rao") == (
        "Hi Asha, I lead marketing."
    )
    assert fill_first_name("Hi {first name}.", "  ") == "Hi {first name}."
    assert fill_first_name("No placeholder.", "Asha") == "No placeholder."


def test_advance_graph_and_due_window():
    assert can_advance("queued", "sent")
    assert can_advance("sent", "followed_up")
    assert can_advance("sent", "replied")
    assert can_advance("queued", "stopped")
    assert not can_advance("sent", "sent")
    assert not can_advance("replied", "sent")
    assert not can_advance("stopped", "queued")
    sent = datetime(2026, 9, 12, tzinfo=timezone.utc)
    due = sent + timedelta(days=FOLLOWUP_DAYS)
    assert is_due("sent", due, due)
    assert not is_due("sent", due, due - timedelta(seconds=1))
    assert not is_due("followed_up", due, due)
    assert MAX_TARGETS_PER_USER == 80
