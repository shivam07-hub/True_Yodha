"""private_notes — the user's OWN private note per entity (never public).

Unlike `comments` (a public community feed keyed by ninja_name), private_notes
is own-only, upsert (one living note per entity), and never exposed to anyone
else. Backs the CV-intake "save my raw story" flow (journey Entry 3.1/3.2) —
PV1-safe: the story stays private to the author.
"""
from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.private_notes import get_private_notes_repository


class _FakeRepo:
    def __init__(self) -> None:
        self.store: dict[tuple[str, str, str], dict[str, Any]] = {}

    def get(self, user_id: str, entity_type: str, entity_id: str) -> dict[str, Any] | None:
        return self.store.get((user_id, entity_type, entity_id))

    def upsert(self, user_id: str, entity_type: str, entity_id: str, body: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        key = (user_id, entity_type, entity_id)
        row = {
            "id": "n1",
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "body": body,
            "created_at": now,
            "updated_at": now,
        }
        self.store[key] = row
        return row


def _override(repo: _FakeRepo, user_id: str = "u1") -> None:
    app.dependency_overrides[get_private_notes_repository] = lambda: repo
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, email=None, token="t1")


def test_put_then_get_roundtrips_the_note() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            put = client.put(
                "/private-notes",
                json={"entity_type": "job", "entity_id": "job-123", "body": "my long GitHub story"},
                headers={"Authorization": "Bearer t1"},
            )
            got = client.get(
                "/private-notes",
                params={"entity_type": "job", "entity_id": "job-123"},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert put.status_code == 200
    assert put.json()["body"] == "my long GitHub story"
    assert got.status_code == 200
    assert got.json()["body"] == "my long GitHub story"
    # identity never leaks to the client
    assert "user_id" not in got.json()


def test_get_missing_note_returns_null_body() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            got = client.get(
                "/private-notes",
                params={"entity_type": "job", "entity_id": "nope"},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert got.status_code == 200
    assert got.json()["body"] is None


def test_put_is_upsert_one_note_per_entity() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            for body in ("first draft", "second draft"):
                client.put(
                    "/private-notes",
                    json={"entity_type": "job", "entity_id": "job-1", "body": body},
                    headers={"Authorization": "Bearer t1"},
                )
    finally:
        app.dependency_overrides.clear()
    # one living note, latest wins — not a thread
    assert len(repo.store) == 1
    assert repo.store[("u1", "job", "job-1")]["body"] == "second draft"
