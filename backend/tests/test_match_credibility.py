"""Credibility gate — the deterministic promote-to-recommended guard.

Covers F3 (unreadable title seniority defers to the brain) and F4 (a job with no
location meta is not falsely barred), the two silent-bar bugs the standardized
matcher fixes.
"""
from __future__ import annotations

from typing import Any

from app.services.match_credibility import (
    evaluate_credibility,
    location_compatible,
    seniority_compatibility,
)

# A profile with the context-hash inputs the gate needs to be able to promote.
_PROFILE = {
    "baseline_version_id": 7,
    "target_role_title": "Software Engineer",
    "target_seniority": "senior",
    "target_location": "gurugram",
    "target_location_country": "india",
}


def _job(**over: Any) -> dict[str, Any]:
    base = {
        "job_id": "j1",
        "title": "Software Engineer II",  # seniority parses to "unknown"
        "location_city": "gurugram",
        "location_country": "india",
        "location_mode": "onsite",
        "location": "Gurugram, India",
    }
    base.update(over)
    return base


# ── F3: unreadable title seniority defers to the brain ──────────────────────────

def test_f3_unknown_title_seniority_defers_to_strong_brain_verdict() -> None:
    # "Software Engineer II" → title parser returns "unknown". A strong Apply at 4.3
    # must NOT be structurally barred from is_recommended; the brain judged level fit.
    cred = evaluate_credibility(_PROFILE, _job(), overall_score=4.3, recommendation="Apply")
    assert cred.seniority_compatibility == "compatible"
    assert cred.credible is True


def test_f3_unknown_title_stays_unknown_when_verdict_is_weak() -> None:
    # No forced compatibility: a Skip / weak score leaves seniority "unknown" (honest).
    cred = evaluate_credibility(_PROFILE, _job(), overall_score=3.0, recommendation="Skip")
    assert cred.seniority_compatibility == "unknown"
    assert cred.credible is False


def test_f3_clear_title_mismatch_still_bars() -> None:
    # A title the parser CAN read as a mismatch is a hard signal — brain doesn't override.
    cred = evaluate_credibility(
        _PROFILE, _job(title="Junior Software Engineer"), overall_score=4.3, recommendation="Apply"
    )
    assert cred.seniority_compatibility == "incompatible"
    assert cred.credible is False


# ── F4: absent location meta is not a mismatch ──────────────────────────────────

def test_f4_no_location_meta_is_not_barred() -> None:
    # A lean job dict (no location_* keys) reached the gate from a caller that didn't
    # attach meta. The pool already location-filtered, so absent meta must not bar it.
    lean = {"job_id": "j2", "title": "Software Engineer II"}
    assert location_compatible(_PROFILE, lean) is True
    cred = evaluate_credibility(_PROFILE, lean, overall_score=4.3, recommendation="Apply")
    assert cred.credible is True


def test_f4_present_but_wrong_location_still_bars() -> None:
    # When meta IS present and mismatches, the gate still works.
    wrong = _job(location_city="mumbai", location_country="india", location="Mumbai, India")
    assert location_compatible(_PROFILE, wrong) is False


def test_seniority_from_ambiguous_numbered_title_is_unknown() -> None:
    # The exact titles from the case study that tripped the old gate.
    assert seniority_compatibility("senior", "Software Engineer II") == "unknown"
    assert seniority_compatibility("senior", "SDE N 4A") == "unknown"
