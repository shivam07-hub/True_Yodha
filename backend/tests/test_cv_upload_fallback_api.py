from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.routers.cv import upload as upload_module


class _FakeChain:
    def __init__(self) -> None:
        self.inserted: dict | None = None

    def table(self, _name: str) -> "_FakeChain":
        return self

    def insert(self, payload: dict) -> "_FakeChain":
        self.inserted = payload
        return self

    def execute(self) -> Any:
        return type("R", (), {"data": [self.inserted]})()


def _auth_override() -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u-fallback", email="u@example.com", token="tok")


def test_upload_fallback_submission_creates_ticket(monkeypatch) -> None:
    chain = _FakeChain()
    monkeypatch.setattr(upload_module, "get_supabase_admin", lambda: chain)
    monkeypatch.setattr(upload_module.settings, "cv_upload_fallback_form_url", "https://example.com/fallback")
    _auth_override()
    try:
        with TestClient(app) as client:
            res = client.post("/cv/upload/fallback", json={
                "attempts": 5,
                "reason_code": "upload_post_interrupted",
                "last_error": "Upload was interrupted. Tap to try again.",
                "file_name": "resume.pdf",
                "file_mime": "application/pdf",
                "file_size_bytes": 106000,
                "route": "/cv",
            })
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 201
    body = res.json()
    assert body["ticket_id"]
    assert body["alternate_submission_url"] == "https://example.com/fallback"
    assert body["sla_hours"] == 12
    assert chain.inserted is not None
    assert chain.inserted["user_id"] == "u-fallback"
    assert chain.inserted["attempts"] == 5
    assert chain.inserted["reason_code"] == "upload_post_interrupted"


def test_upload_fallback_submission_requires_attempts(monkeypatch) -> None:
    chain = _FakeChain()
    monkeypatch.setattr(upload_module, "get_supabase_admin", lambda: chain)
    _auth_override()
    try:
        with TestClient(app) as client:
            res = client.post("/cv/upload/fallback", json={"reason_code": "upload_post_interrupted"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422
