"""Evidence-only seniority selection for the post-skill targeting step."""

import pytest

from app.services.onboarding_service import _seniority_suggestion


def _baseline(structured: dict) -> dict:
    return {"id": 1, "cv_structured": structured}


def test_unknown_title_asks_instead_of_defaulting_to_entry() -> None:
    s = _seniority_suggestion(_baseline({"contact": {"title": "Data Analyst"}}))
    assert s["needs_choice"] is True
    assert s["value"] is None


def test_title_fallback_is_evidence_labelled() -> None:
    s = _seniority_suggestion(_baseline({
        "contact": {"title": ""},
        "experience": [{"role": "Senior Software Engineer"}, {"role": "Intern"}],
    }))
    assert s["title"] == "Senior Software Engineer"
    assert s["value"] == "senior"


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Software Engineering Intern", "intern"),
        ("Junior Data Analyst", "entry"),
        ("Mid-level Product Designer", "mid"),
        ("Lead Software Engineer", "lead"),
        ("Director of Research", "executive"),
    ],
)
def test_explicit_title_seniority_is_evidence(title: str, expected: str) -> None:
    s = _seniority_suggestion(_baseline({"contact": {"title": title}}))
    assert s["value"] == expected
    assert s["source"] == "title"
    assert s["needs_choice"] is False


def test_generic_headline_does_not_hide_explicit_experience_title() -> None:
    s = _seniority_suggestion(_baseline({
        "contact": {"title": "Data Analyst"},
        "experience": [{"role": "Senior Data Analyst"}],
    }))
    assert s["title"] == "Senior Data Analyst"
    assert s["value"] == "senior"


@pytest.mark.parametrize(
    "title",
    ["Product Manager", "Strategy Consultant", "Research Associate", "Data Entry Operator", "Staff Nurse"],
)
def test_role_nouns_do_not_claim_candidate_seniority(title: str) -> None:
    s = _seniority_suggestion(_baseline({"contact": {"title": title}}))
    assert s["value"] is None
    assert s["needs_choice"] is True


def test_empty_when_no_signal() -> None:
    assert _seniority_suggestion(_baseline({"contact": {}, "experience": []}))["needs_choice"] is True


def test_handles_missing_baseline() -> None:
    assert _seniority_suggestion(None)["needs_choice"] is True
