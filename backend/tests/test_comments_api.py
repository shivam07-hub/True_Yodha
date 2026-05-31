from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.routers import comments


def _row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "c1",
        "entity_type": "skill",
        "entity_id": "data-analysis",
        "body": "ran the steering review",
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakeCommentsRepository:
    def __init__(self) -> None:
        self.rows = [_row(), _row(id="c2", body="need a metric")]
        self.created: dict[str, Any] | None = None
        self.update_hit = True
        self.delete_hit = True

    def list_for_entity(self, _user_id: str, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
        return [_row(entity_type=entity_type, entity_id=entity_id, **{"id": r["id"], "body": r["body"]}) for r in self.rows]

    def create(self, user_id: str, entity_type: str, entity_id: str, body: str) -> dict[str, Any]:
        self.created = {"user_id": user_id, "entity_type": entity_type, "entity_id": entity_id, "body": body}
        return _row(entity_type=entity_type, entity_id=entity_id, body=body)

    def update(self, _user_id: str, comment_id: str, body: str) -> dict[str, Any] | None:
        return _row(id=comment_id, body=body) if self.update_hit else None

    def delete(self, _user_id: str, _comment_id: str) -> bool:
        return self.delete_hit


def _override(repo: _FakeCommentsRepository) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[comments.get_token_comments_repository] = lambda: repo


def test_list_comments_for_entity() -> None:
    repo = _FakeCommentsRepository()
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.get("/comments", params={"entity_type": "skill", "entity_id": "data-analysis"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json()["total"] == 2


def test_create_comment_passes_principal_id() -> None:
    repo = _FakeCommentsRepository()
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/comments", json={"entity_type": "job", "entity_id": "job-42", "body": "applied today"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 201
    assert repo.created == {"user_id": "u1", "entity_type": "job", "entity_id": "job-42", "body": "applied today"}


def test_create_rejects_empty_body() -> None:
    repo = _FakeCommentsRepository()
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.post("/comments", json={"entity_type": "skill", "entity_id": "x", "body": "   "})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422


def test_update_404_when_not_owned() -> None:
    repo = _FakeCommentsRepository()
    repo.update_hit = False
    _override(repo)
    try:
        with TestClient(app) as client:
            res = client.patch("/comments/c9", json={"body": "edit"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 404


def test_delete_204_then_404() -> None:
    repo = _FakeCommentsRepository()
    _override(repo)
    try:
        with TestClient(app) as client:
            ok = client.delete("/comments/c1")
        repo.delete_hit = False
        _override(repo)
        with TestClient(app) as client:
            missing = client.delete("/comments/c1")
    finally:
        app.dependency_overrides.clear()
    assert ok.status_code == 204
    assert missing.status_code == 404
