"""POST /jobs/{id}/filing stores a Yes only when the gate is open.

The store is faked. The decision is the real one, so a closed listing cannot
become a row by calling the route.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.repositories.job_filing import get_job_filing_repository
from app.services.apply_filing import FilingFacts


class _FakeRepo:
    def __init__(self, facts: FilingFacts | None) -> None:
        self._facts = facts
        self.saved: list[dict[str, Any]] = []

    def facts(self, user_id: str, job_id: str) -> FilingFacts | None:
        _ = (user_id, job_id)
        return self._facts

    def authorization_for(self, user_id: str, job_id: str) -> dict[str, Any] | None:
        _ = (user_id, job_id)
        return self.saved[-1] if self.saved else None

    def save_authorization(self, **kwargs: Any) -> None:
        self.saved.append(kwargs)


def _live() -> dict:
    at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    return {
        "is_active": True,
        "listing_confidence": "active",
        "last_verified_live_at": at,
        "last_conclusive_verification_at": at,
        "reactivated_at": at,
    }


def _override(repo: _FakeRepo) -> None:
    app.dependency_overrides[get_job_filing_repository] = lambda: repo
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1", email=None)


def test_approving_a_ready_role_stores_the_yes_and_not_an_application() -> None:
    repo = _FakeRepo(FilingFacts(listing=_live(), judge_score=4.0, tailored_cv_id=9))
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/job-1/filing", json={"yes": True})
        assert res.status_code == 200
        body = res.json()
        assert body["ready"] is True
        assert body["authorized"] is True
        assert body["blocks"] == []
        assert repo.saved == [
            {
                "user_id": "user-1",
                "job_id": "job-1",
                "cv_version_id": 9,
                "judge_score": 4.0,
            }
        ]
        assert "status" not in repo.saved[0]
    finally:
        app.dependency_overrides.clear()


def test_a_closed_role_is_not_stored() -> None:
    listing = _live()
    listing["listing_confidence"] = "closed"
    repo = _FakeRepo(FilingFacts(listing=listing, judge_score=4.0, tailored_cv_id=9))
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/jobs/job-1/filing", json={"yes": True})
        assert res.status_code == 200
        assert res.json()["ready"] is False
        assert "listing_closed" in res.json()["blocks"]
        assert repo.saved == []
    finally:
        app.dependency_overrides.clear()


def test_an_unknown_job_is_a_404() -> None:
    repo = _FakeRepo(None)
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.get("/jobs/missing/filing")
        assert res.status_code == 404
        assert repo.saved == []
    finally:
        app.dependency_overrides.clear()
