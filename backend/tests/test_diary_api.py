from datetime import date, datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers import diary


def _daily_log_row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "log-1",
        "log_date": date(2026, 4, 26),
        "entry_text": "Built ETL",
        "skills_delta": [],
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


def _milestone_row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "m1",
        "milestone_date": date(2026, 4, 26),
        "skill": "Python",
        "task": "Ship parser",
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
    def __init__(self) -> None:
        self.total_score = 50.0
        self.existing_daily: dict[str, Any] | None = None
        self.daily_logs = [_daily_log_row()]
        self.milestones = [_milestone_row()]
        self.upserted_daily: dict[str, Any] | None = None
        self.upserted_milestone: dict[str, Any] | None = None

    @property
    def client(self) -> object:
        return object()

    def get_total_score(self, _user_id: str) -> float | None:
        return self.total_score

    def get_daily_log_for_append(
        self,
        _user_id: str,
        _log_date: date,
    ) -> dict[str, Any] | None:
        return self.existing_daily

    def upsert_daily_log(self, payload: dict[str, Any]) -> None:
        self.upserted_daily = payload

    def get_daily_log(self, _user_id: str, log_date: date) -> dict[str, Any]:
        return _daily_log_row(
            log_date=log_date,
            entry_text=(self.upserted_daily or {})["entry_text"],
            skills_delta=(self.upserted_daily or {})["skills_delta"],
        )

    def list_daily_logs(self, _user_id: str, _limit: int) -> list[dict[str, Any]]:
        return self.daily_logs

    def list_user_milestones(self, _user_id: str, _limit: int) -> list[dict[str, Any]]:
        return self.milestones

    def upsert_user_milestone(self, payload: dict[str, Any]) -> None:
        self.upserted_milestone = payload

    def get_user_milestone(self, _user_id: str, milestone_date: date) -> dict[str, Any]:
        return _milestone_row(
            milestone_date=milestone_date,
            task=(self.upserted_milestone or {})["task"],
            completed_at=(self.upserted_milestone or {}).get("completed_at"),
        )

    def list_user_skill_keys(self, _user_id: str) -> list[str]:
        return []

    def list_user_skill_rows(self, _user_id: str) -> list[dict[str, Any]]:
        return []

    def get_user_skill_level_map(self, _user_id: str) -> dict[str, int]:
        return {}

    def get_target_roles(self, _user_id: str) -> list[str]:
        return []

    def upsert_user_skill_rows(self, _rows: list[dict[str, Any]]) -> None:
        return None


def test_create_entry_appends_to_existing_daily_log() -> None:
    repo = _FakeDiaryRepository()
    repo.existing_daily = {"entry_text": "Yesterday", "skills_delta": []}
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[diary.get_token_diary_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.post(
                "/diary/entry",
                json={"entry_text": "Today", "log_date": "2026-04-26"},
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201
    assert repo.upserted_daily is not None
    assert repo.upserted_daily["entry_text"] == "Yesterday\n\n---\n\nToday"
    assert response.json()["score_before"] is None
    assert response.json()["score_after"] is None


def test_history_reads_through_token_diary_repository() -> None:
    repo = _FakeDiaryRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[diary.get_token_diary_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.get("/diary/history")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_upsert_milestone_writes_through_admin_diary_repository() -> None:
    repo = _FakeDiaryRepository()
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "u1", "token": "t1"}
    app.dependency_overrides[diary.get_token_diary_repository] = lambda: repo

    try:
        with TestClient(app) as client:
            response = client.put(
                "/diary/milestones",
                json={
                    "milestone_date": "2026-04-26",
                    "skill": " Python ",
                    "task": "Ship parser",
                    "completed": True,
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert repo.upserted_milestone is not None
    assert repo.upserted_milestone["skill"] == "Python"
    assert repo.upserted_milestone["completed_at"] is not None
