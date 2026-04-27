"""Tests for source_type field in GET /diary/milestones response."""

from datetime import date, datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers import diary


def _personal_row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "p1",
        "milestone_date": date(2026, 4, 26),
        "skill": "Python",
        "task": "Level up Python from L2 to L3",
        "proof": None,
        "impact": None,
        "confidence": 0.6,
        "completed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


def _job_row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "j1",
        "milestone_date": date(2026, 4, 27),
        "skill": "SQL",
        "title": "Build a query",
        "action": "Write a complex JOIN query for the reporting pipeline",
        "proof_prompt": None,
        "impact_prompt": None,
        "proof": None,
        "impact": None,
        "confidence": 0.6,
        "completed_at": None,
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakeDiaryRepository:
    def __init__(
        self,
        personal: list[dict[str, Any]] | None = None,
        job: list[dict[str, Any]] | None = None,
    ) -> None:
        self._personal = personal or []
        self._job = job or []

    @property
    def client(self) -> object:
        return object()

    def list_user_milestones(self, _user_id: str, _limit: int) -> list[dict[str, Any]]:
        return self._personal

    def list_job_application_milestones(self, _user_id: str, _limit: int) -> list[dict[str, Any]]:
        return self._job

    # Other methods not needed for this test
    def get_total_score(self, _user_id: str) -> float | None:
        return None

    def get_daily_log_for_append(self, _u: str, _d: Any) -> None:
        return None

    def upsert_daily_log(self, _p: Any) -> None:
        pass

    def get_daily_log(self, _u: str, _d: Any) -> dict[str, Any]:
        return {}

    def list_daily_logs(self, _u: str, _l: int) -> list[dict[str, Any]]:
        return []

    def upsert_user_milestone(self, _p: Any) -> None:
        pass

    def get_user_milestone(self, _u: str, _d: Any) -> dict[str, Any]:
        return {}

    def list_user_skill_keys(self, _u: str) -> list[str]:
        return []

    def list_user_skill_rows(self, _u: str) -> list[dict[str, Any]]:
        return []

    def get_user_skill_level_map(self, _u: str) -> dict[str, int]:
        return {}

    def get_target_roles(self, _u: str) -> list[str]:
        return []

    def upsert_user_skill_rows(self, _r: Any) -> None:
        pass


def _override(repo: _FakeDiaryRepository) -> None:
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[diary.get_token_diary_repository] = lambda: repo


def _clear() -> None:
    app.dependency_overrides.clear()


def test_personal_milestones_have_source_type_personal() -> None:
    repo = _FakeDiaryRepository(personal=[_personal_row()])
    _override(repo)

    try:
        with TestClient(app) as client:
            response = client.get("/diary/milestones")
    finally:
        _clear()

    assert response.status_code == 200
    milestones = response.json()["milestones"]
    assert len(milestones) == 1
    assert milestones[0]["source_type"] == "personal"


def test_job_milestones_have_source_type_job() -> None:
    repo = _FakeDiaryRepository(job=[_job_row()])
    _override(repo)

    try:
        with TestClient(app) as client:
            response = client.get("/diary/milestones")
    finally:
        _clear()

    assert response.status_code == 200
    milestones = response.json()["milestones"]
    assert len(milestones) == 1
    assert milestones[0]["source_type"] == "job"


def test_mixed_list_has_correct_source_types() -> None:
    repo = _FakeDiaryRepository(personal=[_personal_row()], job=[_job_row()])
    _override(repo)

    try:
        with TestClient(app) as client:
            response = client.get("/diary/milestones")
    finally:
        _clear()

    assert response.status_code == 200
    milestones = response.json()["milestones"]
    assert len(milestones) == 2
    source_types = {m["source_type"] for m in milestones}
    assert source_types == {"personal", "job"}
