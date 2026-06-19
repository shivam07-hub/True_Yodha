from datetime import datetime, timezone

from app.routers.cv.versions import _to_response


def test_cv_version_response_flattens_job_metadata() -> None:
    row = {
        "id": 25,
        "user_version_number": 16,
        "kind": "deterministic",
        "job_id": "autodesk-workplace-events-lead",
        "parent_version_id": 4,
        "baseline_version_id": 4,
        "title": "v16 · 2026-05-18 13:40",
        "hidden_items": ["a", "b"],
        "edited_items": {},
        "cv_structured": {"contact": {"name": "Ada Lovelace"}},
        "body_text": "Tailored CV",
        "polished_text": None,
        "ai_polished": False,
        "created_at": datetime(2026, 5, 18, tzinfo=timezone.utc),
        "jobs": {
            "job_title": "Workplace Events Lead",
            "company_name": "Autodesk",
        },
    }

    response = _to_response(row)

    assert response.job_title == "Workplace Events Lead"
    assert response.company_name == "Autodesk"
    assert response.cv_structured["contact"]["name"] == "Ada Lovelace"
