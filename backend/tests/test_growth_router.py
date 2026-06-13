from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.main import app
from app.repositories.growth import get_growth_repository
from app.routers.growth import get_growth_operator
from app.schemas.growth import GrowthOperator


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _OperatorDB:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def table(self, name: str) -> "_OperatorDB":
        assert name == "growth_operators"
        return self

    def select(self, _columns: str) -> "_OperatorDB":
        return self

    def eq(self, _key: str, _value: Any) -> "_OperatorDB":
        return self

    def limit(self, _value: int) -> "_OperatorDB":
        return self

    def execute(self) -> _Result:
        return _Result(self.rows)


class _FakeRepo:
    def list_command_center(self) -> dict[str, Any]:
        return {
            "assets": [],
            "campaigns": [],
            "messages": [],
            "publications": [],
            "sweeps": [],
            "summary": {
                "assets": 0,
                "campaigns": 0,
                "needs_review": 0,
                "published": 0,
            },
        }

    def update_message(self, message_id: str, body: Any) -> dict[str, Any]:
        return {"id": message_id, "status": body.status or "draft"}

    def approve_message(self, message_id: str, operator_id: str) -> dict[str, Any]:
        return {"id": message_id, "status": "approved", "reviewer_id": operator_id}

    def mark_published(
        self, message_id: str, body: Any, operator_id: str
    ) -> dict[str, Any]:
        return {
            "id": "publication-1",
            "message_id": message_id,
            "status": "published",
            "live_url": str(body.live_url),
            "created_by": operator_id,
        }

    def update_publication_metrics(
        self, publication_id: str, body: Any
    ) -> dict[str, Any]:
        return {
            "id": publication_id,
            "message_id": "message-1",
            "status": "published",
            "final_copy_snapshot": "Exact live copy",
            "outcome": body.model_dump(exclude_none=True),
        }


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def test_growth_route_without_jwt_returns_401() -> None:
    with TestClient(app) as client:
        response = client.get("/growth/bootstrap")

    assert response.status_code == 401


def test_growth_route_rejects_non_operator() -> None:
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_supabase_admin] = lambda: _OperatorDB([])

    with TestClient(app) as client:
        response = client.get("/growth/bootstrap")

    assert response.status_code == 403


def test_growth_route_rejects_inactive_operator() -> None:
    app.dependency_overrides[get_principal] = lambda: Principal(id="user-1")
    app.dependency_overrides[get_supabase_admin] = lambda: _OperatorDB(
        [{"user_id": "user-1", "role": "owner", "active": False}]
    )

    with TestClient(app) as client:
        response = client.get("/growth/bootstrap")

    assert response.status_code == 403


def test_active_operator_can_read_and_mutate() -> None:
    operator = GrowthOperator(user_id="operator-1", role="owner", active=True)
    app.dependency_overrides[get_growth_operator] = lambda: operator
    app.dependency_overrides[get_growth_repository] = lambda: _FakeRepo()

    with TestClient(app) as client:
        bootstrap = client.get("/growth/bootstrap")
        approved = client.post("/growth/messages/message-1/approve")
        metrics = client.patch(
            "/growth/publications/publication-1/metrics",
            json={"impressions": 420, "clicks": 17},
        )

    assert bootstrap.status_code == 200, bootstrap.text
    assert bootstrap.json()["operator"]["user_id"] == "operator-1"
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"
    assert metrics.status_code == 200, metrics.text
    assert metrics.json()["outcome"] == {"impressions": 420, "clicks": 17}
