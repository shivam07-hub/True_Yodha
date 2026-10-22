from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal, get_user_db
from app.main import app
from app.repositories.cv import get_token_cv_repository
from app.routers.cv import versions as versions_router
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


class _ParentOnlyCVRepo:
    def find(self, version_id: int, _user_id: str) -> dict:
        return {"id": version_id, "job_id": "j1", "body_text": "Ran presales."}


def test_polish_with_no_text_back_says_polish_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    """The boundary blanks a 5xx; this detail is authored and must pass it."""

    async def _nothing(**_kwargs: object) -> None:
        return None

    monkeypatch.setattr(versions_router, "_get_job", lambda _db, _job_id: {})
    monkeypatch.setattr(versions_router, "_fetch_targets", lambda _db, _user, _job: [])
    monkeypatch.setattr(versions_router, "_fetch_milestones", lambda _db, _user, _job: [])
    monkeypatch.setattr(versions_router, "_call_ai_polish", _nothing)
    monkeypatch.setattr(versions_router, "get_writer_provider", lambda: object())
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="t@e.com")
    app.dependency_overrides[get_token_cv_repository] = lambda: _ParentOnlyCVRepo()
    app.dependency_overrides[get_user_db] = lambda: object()
    try:
        res = TestClient(app).post("/cv/versions/7/polish")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 503
    assert res.json()["detail"] == "AI polish unavailable right now. Please try again in a minute."
