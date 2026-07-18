"""Deterministic target pre-fill for the score-first confirm card (Slice 4)."""

from app.services.onboarding_service import _infer_target_suggestion


def _baseline(structured: dict) -> dict:
    return {"id": 1, "cv_structured": structured}


def test_role_from_contact_title() -> None:
    s = _infer_target_suggestion(_baseline({"contact": {"title": "Data Analyst", "location": "Bengaluru"}}))
    assert s["role"] == "Data Analyst"
    assert s["location"] == "Bengaluru"
    assert s["seniority"] == "entry"  # plain title → no seniority marker → entry


def test_role_falls_back_to_first_experience() -> None:
    s = _infer_target_suggestion(_baseline({
        "contact": {"title": "", "location": ""},
        "experience": [{"role": "Senior Software Engineer"}, {"role": "Intern"}],
    }))
    assert s["role"] == "Senior Software Engineer"
    assert s["seniority"] == "senior"  # derived from the title marker


def test_empty_when_no_signal() -> None:
    s = _infer_target_suggestion(_baseline({"contact": {}, "experience": []}))
    assert s == {"role": "", "location": "", "seniority": "entry"}


def test_handles_missing_baseline() -> None:
    assert _infer_target_suggestion(None) == {"role": "", "location": "", "seniority": "entry"}
