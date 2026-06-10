"""Home bootstrap BFF composition.

The BFF's own responsibility is assembly + degradation, not the per-section
logic (each composed handler has its own test). So we stub the composed
handlers and assert: (1) one call returns the full bundle, (2) a score 404
degrades to null instead of failing the whole bundle, (3) a non-404 from a
section still propagates.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException, status
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers import home as home_module
from app.routers.home import (
    CVVersionListResponse,
    router as home_router,
)
from app.repositories.cv import get_token_cv_repository
from app.repositories.diary import get_token_diary_repository
from app.repositories.jobs import get_token_jobs_repository
from app.repositories.scores import get_token_scores_repository
from app.repositories.users import get_token_users_repository
from app.schemas import (
    CVEvidenceSummaryResponse,
    DiaryHistoryResponse,
    JobMatchesResponse,
    MirrorScoreResponse,
    UserProfileResponse,
)

_PROFILE = {
    "id": "u1",
    "email": "ninja@example.com",
    "full_name": "Test Ninja",
    "linkedin_url": None,
    "target_roles": [],
    "target_location": None,
    "cv_url": None,
    "onboarding_complete": True,
    "created_at": datetime.now(timezone.utc),
    "last_active_at": datetime.now(timezone.utc),
    "has_cv": True,
    "cv_readiness": "ready",
}


def _stub_all(monkeypatch, *, score_exc: HTTPException | None = None) -> None:
    monkeypatch.setattr(home_module, "get_me", lambda **_: UserProfileResponse(**_PROFILE))

    def _score(**_):
        if score_exc is not None:
            raise score_exc
        return MirrorScoreResponse(
            total_score=42,
            domain_scores={},
            gap_skills=[],
            skills_assessed=3,
            computed_at=datetime.now(timezone.utc),
        )

    monkeypatch.setattr(home_module, "get_my_score", _score)
    monkeypatch.setattr(
        home_module, "get_job_matches",
        lambda **_: JobMatchesResponse(jobs=[], batch_week=date(2026, 6, 1), total=0, dismissed_job_ids=[]),
    )
    monkeypatch.setattr(home_module, "get_applications", lambda **_: [])
    monkeypatch.setattr(
        home_module, "get_cv_evidence",
        lambda **_: CVEvidenceSummaryResponse(
            evidence_count=0,
            diary_entries_count=0,
            skill_upgrades_count=0,
            score_delta=0,
            current_score=0,
            last_cv_score=0,
            next_version_number=1,
        ),
    )
    monkeypatch.setattr(
        home_module, "list_cv_versions", lambda **_: CVVersionListResponse(versions=[])
    )
    monkeypatch.setattr(home_module.upskilling_service, "list_activity_dates", lambda _: [])
    monkeypatch.setattr(
        home_module, "get_diary_history", lambda **_: DiaryHistoryResponse(entries=[], total=0)
    )


@pytest.fixture
def client():
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email="ninja@example.com")
    for dep in (
        get_token_users_repository,
        get_token_scores_repository,
        get_token_jobs_repository,
        get_token_cv_repository,
        get_token_diary_repository,
    ):
        app.dependency_overrides[dep] = lambda: object()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_bootstrap_returns_full_bundle(client, monkeypatch):
    _stub_all(monkeypatch)
    r = client.get("/home/bootstrap")
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "profile", "score", "matches", "applications",
        "evidence", "cv_versions", "practice_activity", "diary",
    }
    assert body["profile"]["full_name"] == "Test Ninja"
    assert body["score"]["total_score"] == 42
    assert body["practice_activity"] == {"dates": []}


def test_score_404_degrades_to_null(client, monkeypatch):
    _stub_all(monkeypatch, score_exc=HTTPException(status_code=status.HTTP_404_NOT_FOUND))
    r = client.get("/home/bootstrap")
    assert r.status_code == 200
    assert r.json()["score"] is None


def test_non_404_section_error_propagates(client, monkeypatch):
    _stub_all(monkeypatch, score_exc=HTTPException(status_code=503, detail="down"))
    r = client.get("/home/bootstrap")
    assert r.status_code == 503
