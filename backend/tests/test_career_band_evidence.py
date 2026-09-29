"""The Field card's evidence survives the response model.

`GET /roles/bands` declares `response_model=list[CareerBandOption]`, and FastAPI
drops every key the model does not name — silently. The migration that added
`cv_skill_count` / `matched_count` / `matched_skills` to `career_band_options`
would have reached the database and been stripped at the door.

NULL is "we could not read a CV", 0 / [] is "read it, nothing of yours is asked
here" — the card says nothing for the first and says so for the second, so the
model must keep the two apart rather than defaulting one into the other.
"""
from __future__ import annotations

from app.routers.roles import CareerBandOption


def test_the_evidence_reaches_the_client() -> None:
    row = {
        "band": "business_product_operations",
        "job_count": 20659,
        "family_count": 154,
        "fit": 24.3,
        "cv_skill_count": 34,
        "matched_count": 18,
        "matched_skills": ["Leadership", "Stakeholder Management", "Consulting"],
    }
    dumped = CareerBandOption(**row).model_dump()
    assert dumped["cv_skill_count"] == 34
    assert dumped["matched_count"] == 18
    assert dumped["matched_skills"] == ["Leadership", "Stakeholder Management", "Consulting"]


def test_no_cv_stays_null_and_nothing_asked_stays_zero() -> None:
    base = {"band": "design_creative", "job_count": 234, "family_count": 8, "fit": 0}
    unknown = CareerBandOption(**base, cv_skill_count=None, matched_count=None, matched_skills=None)
    assert unknown.matched_count is None and unknown.matched_skills is None
    known = CareerBandOption(**base, cv_skill_count=34, matched_count=0, matched_skills=[])
    assert known.matched_count == 0 and known.matched_skills == []


def test_a_row_from_before_the_migration_still_validates() -> None:
    """Production reads the same function; an older row shape must not 500."""
    old = CareerBandOption(band="engineering_data", job_count=1, family_count=1, fit=0)
    assert old.matched_skills is None
