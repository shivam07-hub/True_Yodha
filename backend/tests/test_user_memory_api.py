"""User Memory (Phase 1) — own-only CRUD for the caller's memory facts.

The persistent "knows me" store: aspirations/constraints/habits/salary/work_mode/
notes. Authored write path in Phase 1; distilled facts arrive server-side later.
"""
from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.user_memory import get_user_memory_repository


class _FakeRepo:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self._seq = 0

    def list_active(self, user_id: str, kinds: list[str] | None = None) -> list[dict[str, Any]]:
        out = [r for r in self.rows if r["user_id"] == user_id and r["status"] == "active"]
        if kinds:
            out = [r for r in out if r["kind"] in kinds]
        return list(reversed(out))

    def add(self, user_id: str, *, kind, text, resolved=None, source="authored", confidence=None):
        self._seq += 1
        now = datetime.now(timezone.utc)
        row = {
            "id": f"m{self._seq}", "user_id": user_id, "kind": kind, "text": text,
            "resolved": resolved, "source": source, "confidence": confidence,
            "status": "active", "created_at": now, "updated_at": now,
        }
        self.rows.append(row)
        return row

    def update(self, user_id: str, memory_id: str, updates: dict[str, Any]):
        for r in self.rows:
            if r["id"] == memory_id and r["user_id"] == user_id:
                r.update({k: v for k, v in updates.items() if k != "updated_at"})
                return r
        return None

    def delete(self, user_id: str, memory_id: str) -> None:
        self.rows = [r for r in self.rows if not (r["id"] == memory_id and r["user_id"] == user_id)]


def _override(repo: _FakeRepo, user_id: str = "u1") -> None:
    app.dependency_overrides[get_user_memory_repository] = lambda: repo
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, email=None, token="t1")


def test_add_list_dismiss_delete_roundtrip() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            h = {"Authorization": "Bearer t1"}
            add = client.post("/memory", json={"kind": "aspiration", "text": "Move into AI product"}, headers=h)
            listed = client.get("/memory", headers=h)
            mid = add.json()["id"]
            dismissed = client.patch(f"/memory/{mid}", json={"status": "dismissed"}, headers=h)
            after = client.get("/memory", headers=h)
            deleted = client.delete(f"/memory/{mid}", headers=h)
    finally:
        app.dependency_overrides.clear()

    assert add.status_code == 201
    assert add.json()["source"] == "authored"
    assert "user_id" not in add.json()  # identity never leaks
    assert [f["text"] for f in listed.json()["facts"]] == ["Move into AI product"]
    assert dismissed.json()["status"] == "dismissed"
    assert after.json()["facts"] == []  # dismissed drops from active list
    assert deleted.status_code == 204


def test_rejects_unknown_kind() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/memory", json={"kind": "target_role", "text": "PM"},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    # target_role has a profile column + its own setter — not a memory kind
    assert resp.status_code == 422


def test_patch_missing_fact_404s() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            resp = client.patch(
                "/memory/nope", json={"status": "dismissed"},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 404
