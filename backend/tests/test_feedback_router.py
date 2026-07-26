"""Tests for routers/feedback.py — Feedback Hub endpoints.

Covers the unified Feedback Hub backend surface (Backlog #17):
- POST /feedback accepts the six categories (legacy + new).
- GET /feedback/my requires auth and returns the user's reports.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.feedback_test_support import patch_admin, patch_user  # noqa: F401


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
    assert response.json() == {"ok": True, "id": 99, "replayed": False}
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
