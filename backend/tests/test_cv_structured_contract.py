import pytest
from fastapi import HTTPException

from app.repositories.cv import CVVersionsRepository
from app.routers.cv.structured import CVStructuredResponse
from app.services import cv_parser
from app.services.cv_structured_shape import CONTRACT_KEYS


def _minimal_payload() -> dict:
    return {
        "summary": None,
        "education": [],
        "experience": [],
        "projects": [],
        "skills_line": None,
        "certs": [],
    }


def test_legacy_structured_payload_gets_empty_contact_block() -> None:
    structured = CVStructuredResponse(**_minimal_payload())

    assert structured.contact.model_dump() == {
        "name": "",
        "title": "",
        "email": "",
        "phone": "",
        "location": "",
        "linkedin": "",
    }


def test_contact_round_trips_independently_of_account_profile() -> None:
    structured = CVStructuredResponse(
        **_minimal_payload(),
        contact={
            "name": "Ada Lovelace",
            "title": "Engineer",
            "email": "cv@example.com",
            "phone": "+44 20 0000 0000",
            "location": "London",
            "linkedin": "linkedin.com/in/ada",
        },
    )

    assert structured.model_dump()["contact"]["email"] == "cv@example.com"


# ── The contact-only row (2026-04-18 → 05-01, 6 users) ───────────────────────
# `scripts/repair_cv_contact.py` filled `contact` on rows whose `cv_structured`
# was NULL, producing `{"contact": {...}}`. NULL was a self-healing state; the
# 1-key dict was truthy, so the rebuild was skipped and the payload went into a
# 7-field response model. Every CV page load and every download 500'd, for a
# week, with `body_text` intact in the same row.


def test_partial_row_normalizes_instead_of_exploding() -> None:
    """The exact production payload must produce a renderable response, not a 500."""
    poisoned = {"contact": {"name": "ANURAAG KUMAR", "phone": "9…49125", "location": ""}}

    normalized = cv_parser.normalize_structured(poisoned)

    CVStructuredResponse(**normalized)  # would raise 6 validation errors unnormalized
    assert normalized["contact"]["name"] == "ANURAAG KUMAR"
    assert normalized["education"] == []
    assert normalized["summary"] is None


def test_contact_only_row_is_not_content_so_the_rebuild_runs() -> None:
    """`has_content` is the gate that `if structured:` should always have been."""
    assert cv_parser.has_content({"contact": {"name": "ANURAAG KUMAR"}}) is False
    assert cv_parser.has_content(cv_parser.normalize_structured({})) is False
    assert cv_parser.has_content(None) is False
    assert cv_parser.has_content({**_minimal_payload(), "certs": ["AWS SAA"]}) is True


def test_normalize_survives_junk_without_raising() -> None:
    for junk in ({"education": "not a list"}, {"experience": [None, 3]}, {"certs": {}}):
        normalized = cv_parser.normalize_structured(junk)
        CVStructuredResponse(**normalized)
    assert cv_parser.normalize_structured(None) is None
    assert cv_parser.normalize_structured("nope") is None


def test_write_seam_rejects_a_partial_payload() -> None:
    """No writer may persist half a payload — that is what made this permanent."""
    with pytest.raises(HTTPException) as exc:
        CVVersionsRepository._reject_partial_structured({"contact": {}}, seam="test")
    assert exc.value.status_code == 500

    # Absent stays legal: NULL / {} is the "not parsed yet" state the read path
    # rebuilds from body_text. Only half-written is banned.
    CVVersionsRepository._reject_partial_structured({}, seam="test")
    CVVersionsRepository._reject_partial_structured(None, seam="test")
    CVVersionsRepository._reject_partial_structured(
        CVStructuredResponse(**_minimal_payload()).model_dump(), seam="test"
    )


def test_one_contract_shared_by_the_model_the_shape_module_and_the_parser() -> None:
    """Three layers, one definition. Drift fails here rather than in production."""
    assert CONTRACT_KEYS == set(CVStructuredResponse.model_fields)
    assert CONTRACT_KEYS == set(cv_parser.normalize_structured({}))
    assert cv_parser.CONTRACT_KEYS is CONTRACT_KEYS


def test_reading_a_cv_never_edits_it() -> None:
    """Ingest hygiene (trim, 300-char bullet cap) belongs to what ENTERS the
    system. Applying it on read would silently shorten a bullet the user typed in
    the CV editor, which enforces no such cap."""
    long_bullet = "x" * 500
    stored = {
        **_minimal_payload(),
        "summary": "  Leading with a space.  ",
        "experience": [{"company": "Cap ", "role": "BDM", "dates": "", "location": "",
                        "bullets": [long_bullet]}],
    }

    normalized = cv_parser.normalize_structured(stored)

    assert normalized["experience"][0]["bullets"] == [long_bullet]
    assert normalized["experience"][0]["company"] == "Cap "
    assert normalized["summary"] == "  Leading with a space.  "


def test_llm_output_is_still_trimmed_and_capped_on_the_way_in() -> None:
    ingested = cv_parser._validate_structured({
        "summary": "  Trim me.  ",
        "experience": [{"company": " Cap ", "role": "BDM", "bullets": ["y" * 500]}],
    })

    assert ingested["summary"] == "Trim me."
    assert ingested["experience"][0]["company"] == "Cap"
    assert len(ingested["experience"][0]["bullets"][0]) == 300


def test_normalizing_a_canonical_payload_is_a_no_op() -> None:
    """Idempotence is what makes the read seam safe to run on every read — and
    what keeps content fingerprints (weave proposals) stable across it."""
    canonical = cv_parser.normalize_structured({
        **_minimal_payload(),
        "contact": {"name": "Ada"},
        "experience": [{"company": "Analytical", "role": "Engineer", "dates": "1843",
                        "location": "", "bullets": ["Wrote the first program."]}],
    })

    assert cv_parser.normalize_structured(canonical) == canonical
