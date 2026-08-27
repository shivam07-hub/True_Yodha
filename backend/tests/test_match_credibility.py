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


def test_f3_clear_source_mismatch_still_bars() -> None:
    cred = evaluate_credibility(
        _PROFILE,
        _job(title="Software Engineer", seniority_level="entry"),
        overall_score=4.3,
        recommendation="Apply",
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


def test_seniority_from_missing_source_field_is_unknown() -> None:
    assert seniority_compatibility("senior", {"title": "Software Engineer II"}) == "unknown"
    assert seniority_compatibility("senior", {"title": "SDE N 4A"}) == "unknown"


# ── F5: absence of a scoping key is not a verdict ───────────────────────────────
#
# The third silent-bar bug, same family as F3/F4. `target_context_hash` answers
# "which direction was this computed for", not "is this a good recommendation" —
# but it sat inside the `credible` conjunction, and it was only written when BOTH
# a baseline and a role title were present. Two consequences, both measured in
# prod on 2026-08-13:
#   - the writer produced NULL while `onboarding_service.get_result` hashed
#     unconditionally, so `get_matches_for_context` matched nothing and the
#     onboarding screen said "the market genuinely has no overlap" over a full
#     stack — 162 of 196 users, 1,289 real match rows;
#   - nothing could ever be promoted, so 153 users had brain-rated matches and
#     exactly ONE had an `is_recommended` row.

def test_f5_missing_role_title_still_scopes_and_still_promotes() -> None:
    profile = {**_PROFILE, "target_role_title": ""}
    cred = evaluate_credibility(profile, _job(), 4.2, "Apply")
    assert cred.context_hash is not None, "a blank direction is still a direction"
    assert cred.credible is True


def test_f5_hash_is_stable_for_the_same_blank_direction() -> None:
    """Writer and reader must derive the SAME key, or the lookup finds nothing."""
    profile = {**_PROFILE, "target_role_title": ""}
    a = evaluate_credibility(profile, _job(), 4.2, "Apply").context_hash
    b = evaluate_credibility(profile, _job(job_id="j2"), 3.9, "Negotiate").context_hash
    assert a == b


def test_f5_direction_change_still_moves_the_key() -> None:
    base = evaluate_credibility(_PROFILE, _job(), 4.2, "Apply").context_hash
    moved = evaluate_credibility(
        {**_PROFILE, "target_role_title": "Data Scientist"}, _job(), 4.2, "Apply"
    ).context_hash
    assert base != moved


def test_f5_absent_baseline_leaves_the_key_unscopeable_but_judges_on_merit() -> None:
    """No baseline → nothing to scope to (a separate defect). The recommendation
    is still judged on its own merits rather than vetoed by the bookkeeping."""
    profile = {**_PROFILE, "baseline_version_id": None}
    cred = evaluate_credibility(profile, _job(), 4.2, "Apply")
    assert cred.context_hash is None
    assert cred.credible is True


def test_f5_a_weak_match_is_still_barred() -> None:
    """Loosening the scoping key must not loosen the actual gate."""
    assert evaluate_credibility(_PROFILE, _job(), 2.9, "Apply").credible is False
    assert evaluate_credibility(_PROFILE, _job(), 4.5, "Skip").credible is False
    assert evaluate_credibility(_PROFILE, _job(seniority_level="intern"), 4.5, "Apply").credible is False
