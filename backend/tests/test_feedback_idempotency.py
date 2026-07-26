from __future__ import annotations

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.main import app
from app.services.feedback_delivery import feedback_fingerprint
from tests.feedback_test_support import patch_admin, patch_user  # noqa: F401

IDEMPOTENCY_KEY = "5e5c353d-5c3e-4ae4-9387-4119a0a21c01"


def test_submit_feedback_replays_same_idempotent_request(
    patch_admin,
    patch_user,
) -> None:
    payload = {"title": "Upload failed", "body": "It failed twice."}
    fingerprint = feedback_fingerprint("bug", payload)
    chain = patch_admin(
        {
            "user_feedback": {
                "rows": [{"id": 77, "idempotency_fingerprint": fingerprint}]
            }
        }
    )
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "bug", "payload": payload},
            headers={
                "Authorization": "Bearer t",
                "Idempotency-Key": IDEMPOTENCY_KEY,
            },
        )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "id": 77, "replayed": True}
    assert chain._inserted is None


def test_submit_feedback_persists_delivery_key_and_fingerprint(
    patch_admin,
    patch_user,
) -> None:
    payload = {"title": "Upload failed", "body": "It failed twice."}
    chain = patch_admin({"user_feedback": {"rows": [], "inserted_id": 76}})
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "bug", "payload": payload},
            headers={
                "Authorization": "Bearer t",
                "Idempotency-Key": IDEMPOTENCY_KEY,
            },
        )

    assert response.status_code == 201
    assert response.json() == {"ok": True, "id": 76, "replayed": False}
    assert chain._inserted is not None
    assert chain._inserted["idempotency_key"] == IDEMPOTENCY_KEY
    assert chain._inserted["idempotency_fingerprint"] == feedback_fingerprint(
        "bug",
        payload,
    )


def test_submit_feedback_rejects_key_reuse_for_different_content(
    patch_admin,
    patch_user,
) -> None:
    chain = patch_admin(
        {
            "user_feedback": {
                "rows": [
                    {
                        "id": 77,
                        "idempotency_fingerprint": feedback_fingerprint(
                            "bug",
                            {"title": "Original", "body": "Original report"},
                        ),
                    }
                ]
            }
        }
    )
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={
                "type": "bug",
                "payload": {"title": "Changed", "body": "Changed report"},
            },
            headers={
                "Authorization": "Bearer t",
                "Idempotency-Key": IDEMPOTENCY_KEY,
            },
        )

    assert response.status_code == 409
    assert "different feedback" in response.json()["detail"].lower()
    assert chain._inserted is None


def test_submit_feedback_collapses_concurrent_duplicate_insert(
    patch_admin,
    patch_user,
) -> None:
    payload = {"title": "Upload failed", "body": "It failed twice."}
    fingerprint = feedback_fingerprint("bug", payload)
    duplicate = APIError(
        {
            "code": "23505",
            "message": "duplicate key value violates unique constraint",
            "details": None,
            "hint": None,
        }
    )
    patch_admin(
        {
            "user_feedback": {
                "insert_error": duplicate,
                "rows_sequence": [
                    [],
                    [{"id": 78, "idempotency_fingerprint": fingerprint}],
                ],
            }
        }
    )
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "bug", "payload": payload},
            headers={
                "Authorization": "Bearer t",
                "Idempotency-Key": IDEMPOTENCY_KEY,
            },
        )

    assert response.status_code == 200
    assert response.json() == {"ok": True, "id": 78, "replayed": True}


def test_submit_feedback_rejects_non_uuid_idempotency_key(
    patch_admin,
    patch_user,
) -> None:
    patch_admin({"user_feedback": {"rows": []}})
    patch_user("u1")

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "bug", "payload": {"title": "A", "body": "B"}},
            headers={
                "Authorization": "Bearer t",
                "Idempotency-Key": "reused-human-label",
            },
        )

    assert response.status_code == 422


def test_anonymous_replay_only_matches_anonymous_receipt(
    patch_admin,
    patch_user,
) -> None:
    payload = {"title": "Mobile issue", "body": "The form failed."}
    chain = patch_admin(
        {
            "user_feedback": {
                "rows": [
                    {
                        "id": 79,
                        "idempotency_fingerprint": feedback_fingerprint(
                            "bug",
                            payload,
                        ),
                    }
                ]
            }
        }
    )
    patch_user(None)

    with TestClient(app) as client:
        response = client.post(
            "/feedback",
            json={"type": "bug", "payload": payload},
            headers={"Idempotency-Key": IDEMPOTENCY_KEY},
        )

    assert response.status_code == 200
    assert ("user_id", "null") in chain._filters
