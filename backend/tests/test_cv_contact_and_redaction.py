"""Contact parsing + outbound redaction.

Regression suite for the defect that printed `[REDACTED_CV_HEADER]` where a
user's name belongs, on CVs they downloaded and sent to employers.

Two invariants, both falsified by the pre-fix code:
  1. Redaction never destroys CV content (it deleted whole experience rows).
  2. A redaction marker never becomes a value (it became the printed name).
"""

from __future__ import annotations

import pytest

from app.security.personal_data import (
    contains_redaction_token,
    redact_personal_data_text,
    sanitize_cv_text_for_ai,
)
from app.services.cv_contact import header_lines, looks_like_phone, parse_contact

ONE_LINE_HEADER = """Ashwani Maurya | ashwani@x.com | +91 7376104167
EXPERIENCE
Video Editor, Make My Social Media (2023-2024)
Edited 20+ advertisement videos for Instagram."""

MULTI_LINE_HEADER = """ASHWANI MAURYA
Video Editor
Bengaluru, India
ashwani.maurya@gmail.com | +91 73761 04167
linkedin.com/in/ashwani-maurya

EXPERIENCE
Multimedia Head, Wayanad House, IIT Madras
Edited 15+ videos, designed 30+ posters. Repo https://github.com/ash/reel"""


# ── Invariant 1: redaction must not eat CV content ────────────────────────────

def test_one_line_header_keeps_the_experience_section():
    """The pre-fix rule blanked the first three non-empty lines. On this CV that
    deleted the EXPERIENCE heading and the entire first role — the model never
    saw the employer."""
    sent = sanitize_cv_text_for_ai(ONE_LINE_HEADER)
    assert "EXPERIENCE" in sent
    assert "Make My Social Media" in sent
    assert "Edited 20+ advertisement videos" in sent


def test_header_identifiers_never_leave():
    sent = sanitize_cv_text_for_ai(MULTI_LINE_HEADER)
    assert "ashwani.maurya@gmail.com" not in sent
    assert "73761" not in sent
    assert "ASHWANI MAURYA" not in sent


def test_professional_header_context_survives():
    """Title and location are professional signal, not direct identifiers."""
    sent = sanitize_cv_text_for_ai(MULTI_LINE_HEADER)
    assert "Video Editor" in sent
    assert "Bengaluru, India" in sent


def test_project_urls_in_bullets_survive():
    """A GitHub link inside a bullet is the user's own portfolio, and its loss is
    visible in the CV they download."""
    assert "github.com/ash/reel" in sanitize_cv_text_for_ai(MULTI_LINE_HEADER)


@pytest.mark.parametrize("text", [
    "Internship 10-12-2023 to 04-06-2024",
    "Handled 250 500 1200 tickets across three quarters",
    "Scaled from 10 000 to 250 000 monthly active users",
    "Improved NPS 32 to 61 across 2 400 responses",
])
def test_dates_and_metrics_are_not_mistaken_for_phone_numbers(text):
    assert redact_personal_data_text(text) == text


@pytest.mark.parametrize("phone", ["+91 7376104167", "+91 73761 04167", "(020) 7946 0958"])
def test_real_phone_numbers_are_redacted(phone):
    assert "[REDACTED_PHONE]" in redact_personal_data_text(f"Call me on {phone} anytime")


def test_looks_like_phone_rejects_dates():
    assert not looks_like_phone("10-12-2023")
    assert looks_like_phone("+91 7376104167")


# ── Invariant 2: a marker is never a value ────────────────────────────────────

def test_contact_is_read_from_the_raw_cv_not_the_redacted_text():
    contact = parse_contact(ONE_LINE_HEADER)
    assert contact["name"] == "Ashwani Maurya"
    assert contact["email"] == "ashwani@x.com"
    assert "REDACTED" not in str(contact)


def test_multi_line_contact_fields():
    contact = parse_contact(MULTI_LINE_HEADER)
    assert contact["name"] == "ASHWANI MAURYA"
    assert contact["title"] == "Video Editor"
    assert contact["location"] == "Bengaluru, India"
    assert contact["linkedin"] == "linkedin.com/in/ashwani-maurya"


def test_unicode_names_are_read_not_dropped():
    cv = "José Álvarez\nMadrid, Spain\njose@mail.es\n\nEDUCATION\nBSc Computer Science"
    assert parse_contact(cv)["name"] == "José Álvarez"


def test_missing_name_returns_empty_not_a_guess():
    """Empty is what lets the caller fall back to the profile name. A truthy
    placeholder defeats every fallback in the chain (ADR-0016: no fabrication)."""
    cv = "EXPERIENCE\nEngineer, Acme\nBuilt things."
    assert parse_contact(cv)["name"] == ""


def test_header_detection_is_bounded_not_positional():
    assert header_lines(ONE_LINE_HEADER) == ["Ashwani Maurya | ashwani@x.com | +91 7376104167"]
    assert len(header_lines(MULTI_LINE_HEADER)) == 5


@pytest.mark.parametrize("payload", [
    "[REDACTED_CV_HEADER]",
    {"contact": {"name": "[REDACTED_CV_HEADER]"}},
    {"experience": [{"bullets": ["Reached out on [REDACTED_EMAIL]"]}]},
    ["fine", "[REDACTED_ID]"],
])
def test_redaction_tokens_are_detected_anywhere_in_a_payload(payload):
    assert contains_redaction_token(payload)


def test_clean_payloads_pass_the_gate():
    assert not contains_redaction_token(
        {"contact": {"name": "Ashwani Maurya"}, "experience": [{"bullets": ["Edited 20+ videos"]}]}
    )
