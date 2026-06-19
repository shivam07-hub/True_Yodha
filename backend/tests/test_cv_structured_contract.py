from app.routers.cv.structured import CVStructuredResponse


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
