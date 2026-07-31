"""Evidence-only seniority selection for the post-skill targeting step."""

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


def test_empty_when_no_signal() -> None:
    assert _seniority_suggestion(_baseline({"contact": {}, "experience": []}))["needs_choice"] is True


def test_handles_missing_baseline() -> None:
    assert _seniority_suggestion(None)["needs_choice"] is True
