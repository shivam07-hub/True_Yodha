"""Tests for routers/feedback.py — Feedback Hub endpoints.

Covers the unified Feedback Hub backend surface (Backlog #17):
- POST /feedback accepts the six categories (legacy + new).
- GET /feedback/my requires auth and returns the user's reports.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import feedback as feedback_router


class _Chain:
    """PostgREST-style call recorder. Build chains, capture inserts/filters."""

    def __init__(self, routes: dict[str, Any]) -> None:
        self._routes = routes
        self._table: str | None = None
        self._filters: list[tuple[str, Any]] = []
        self._inserted: dict | None = None

    def table(self, name: str) -> "_Chain":
        self._table = name
        self._filters = []
        self._inserted = None
        return self

    def insert(self, payload: dict) -> "_Chain":
        self._inserted = payload
        return self

    def select(self, *_a: Any, **_kw: Any) -> "_Chain":
        return self

    def eq(self, col: str, val: Any) -> "_Chain":
        self._filters.append((col, val))
        return self

    def order(self, *_a: Any, **_kw: Any) -> "_Chain":
        return self

    def limit(self, _n: int) -> "_Chain":
        return self

    def execute(self) -> Any:
        spec = self._routes.get(self._table) or {}
        if self._inserted is not None:
            if spec.get("insert_error") is not None:
                raise spec["insert_error"]
            # mimic Supabase: insert returns the inserted row
            row = {**self._inserted}
            row.setdefault("id", spec.get("inserted_id", 1))
            row.setdefault("created_at", spec.get("created_at", "2026-06-14T12:00:00Z"))
            return _Result([row])
        rows_sequence = spec.get("rows_sequence")
        if rows_sequence:
            return _Result(rows_sequence.pop(0))
        return _Result(spec.get("rows", []))


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


@pytest.fixture
def patch_admin(monkeypatch: pytest.MonkeyPatch):
    """Patch the admin-client dependency used by the feedback router."""

    def _apply(routes: dict[str, Any]) -> _Chain:
        chain = _Chain(routes)
        monkeypatch.setattr(feedback_router, "get_supabase_admin", lambda: chain)
        return chain

    return _apply


@pytest.fixture
def patch_user(monkeypatch: pytest.MonkeyPatch):
    """Patch token → user_id resolution."""

    def _apply(user_id: str | None) -> None:
        monkeypatch.setattr(feedback_router, "_resolve_user_id", lambda _c: user_id)

    return _apply


# ── POST /feedback ────────────────────────────────────────────────────────


def test_submit_feedback_accepts_new_categories(patch_admin, patch_user) -> None:
    chain = patch_admin({"user_feedback": {"inserted_id": 99}})
    patch_user("user-uuid-1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "idea", "payload": {"title": "X", "body": "Y"}},
            headers={"Authorization": "Bearer faketoken"},
        )

    assert response.status_code == 201, response.text
    assert response.json() == {"ok": True, "id": 99}
    assert chain._inserted is not None
    assert chain._inserted["type"] == "idea"
    assert chain._inserted["user_id"] == "user-uuid-1"


@pytest.mark.parametrize("category", ["bug", "idea", "question", "praise", "feedback", "company"])
def test_submit_feedback_all_categories(patch_admin, patch_user, category: str) -> None:
    patch_admin({"user_feedback": {"inserted_id": 1}})
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": category, "payload": {"title": "t", "body": "b"}},
            headers={"Authorization": "Bearer t"},
        )

    assert response.status_code == 201, response.text


def test_submit_feedback_rejects_unknown_category(patch_admin, patch_user) -> None:
    patch_admin({"user_feedback": {"inserted_id": 1}})
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "totally-made-up", "payload": {}},
            headers={"Authorization": "Bearer t"},
        )

    assert response.status_code == 422


def test_submit_feedback_anonymous_allowed(patch_admin, patch_user) -> None:
    chain = patch_admin({"user_feedback": {"inserted_id": 5}})
    patch_user(None)  # no token

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "praise", "payload": {"title": "love it", "body": "great"}},
        )

    assert response.status_code == 201
    # anonymous → no user_id key in the insert row
    assert "user_id" not in (chain._inserted or {})


def test_submit_feedback_rejects_reserved_beta_assignment_program(
    patch_admin,
    patch_user,
) -> None:
    patch_admin({"user_feedback": {"inserted_id": 5}})
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={
                "type": "feedback",
                "payload": {"program": "intern_beta_assignment_v1"},
            },
            headers={"Authorization": "Bearer t"},
        )

    assert response.status_code == 422
    assert "reserved" in response.json()["detail"].lower()


# ── GET /feedback/my ──────────────────────────────────────────────────────


def test_list_my_feedback_requires_auth(patch_admin, patch_user) -> None:
    patch_admin({"user_feedback": {"rows": []}})
    patch_user(None)

    with TestClient(app) as client:
        response = client.get("/feedback/my")

    assert response.status_code == 401


def test_list_my_feedback_returns_rows(patch_admin, patch_user) -> None:
    rows = [
        {
            "id": 10,
            "type": "bug",
            "status": "in_progress",
            "payload": {"title": "Forge resets", "body": "..."},
            "created_at": "2026-05-19T10:00:00Z",
        },
        {
            "id": 9,
            "type": "idea",
            "status": "shipped",
            "payload": {"title": "Universal forge", "body": "..."},
            "created_at": "2026-05-18T10:00:00Z",
        },
    ]
    patch_admin({"user_feedback": {"rows": rows}})
    patch_user("u1")

    with TestClient(app) as client:
        response = client.get(
            "/feedback/my",
            headers={"Authorization": "Bearer t"},
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body) == 2
    assert body[0]["status"] == "in_progress"
    assert body[1]["type"] == "idea"
