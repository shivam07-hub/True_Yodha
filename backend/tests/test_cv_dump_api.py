"""Brain-dump notebook (User Memory Phase 3) — own-only /cv/dump CRUD."""
from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.cv_dump import get_cv_dump_repository


class _FakeRepo:
    def __init__(self) -> None:
        self.rows: list[dict[str, Any]] = []
        self._seq = 0

    def add(self, user_id: str, text: str, source: str = "manual") -> dict[str, Any]:
        self._seq += 1
        row = {
            "id": f"d{self._seq}",
            "user_id": user_id,
            "text": text,
            "source": source,
            "created_at": datetime.now(timezone.utc),
        }
        self.rows.append(row)
        return row

    def list_recent(self, user_id: str, limit: int = 30) -> list[dict[str, Any]]:
        return list(reversed([r for r in self.rows if r["user_id"] == user_id]))[:limit]

    def delete(self, user_id: str, entry_id: str) -> None:
        self.rows = [r for r in self.rows if not (r["id"] == entry_id and r["user_id"] == user_id)]


def _override(repo: _FakeRepo, user_id: str = "u1") -> None:
    app.dependency_overrides[get_cv_dump_repository] = lambda: repo
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id=user_id, email=None, token="t1")


def test_dump_add_list_delete_roundtrip() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            h = {"Authorization": "Bearer t1"}
            added = client.post("/cv/dump", json={"text": "Led the campus fest sponsorship drive, raised 4L."}, headers=h)
            listed = client.get("/cv/dump", headers=h)
            eid = added.json()["id"]
            deleted = client.delete(f"/cv/dump/{eid}", headers=h)
            after = client.get("/cv/dump", headers=h)
    finally:
        app.dependency_overrides.clear()

    assert added.status_code == 201
    assert "user_id" not in added.json()  # identity never leaks
    assert [e["text"] for e in listed.json()["entries"]] == ["Led the campus fest sponsorship drive, raised 4L."]
    assert deleted.status_code == 204
    assert after.json()["entries"] == []


def test_dump_records_source_provenance() -> None:
    """A capture from another surface (e.g. "Not it? Tell Myro") tags its source
    so /notebook can show where the entry came from; hand-typed defaults to manual."""
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            h = {"Authorization": "Bearer t1"}
            tagged = client.post("/cv/dump", json={"text": "want data roles, not sales", "source": "job_intent"}, headers=h)
            plain = client.post("/cv/dump", json={"text": "led the fest drive"}, headers=h)
    finally:
        app.dependency_overrides.clear()
    assert tagged.status_code == 201
    assert tagged.json()["source"] == "job_intent"
    assert plain.json()["source"] == "manual"


def test_dump_rejects_bad_source() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            resp = client.post(
                "/cv/dump",
                json={"text": "hi", "source": "Not A Source!"},
                headers={"Authorization": "Bearer t1"},
            )
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 422


def test_dump_rejects_blank() -> None:
    repo = _FakeRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            resp = client.post("/cv/dump", json={"text": ""}, headers={"Authorization": "Bearer t1"})
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 422
