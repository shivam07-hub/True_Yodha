"""Tests for POST /auth/extension-session.

The endpoint mints a fresh INDEPENDENT Supabase session for the browser
extension via the admin generate-link → verify-otp dance, so the extension
never shares a refresh-token family with the web app session.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.deps import Principal, get_principal
from app.main import app
from app.routers import auth as auth_router

from tests.conftest import fake_principal


class _FakeAdminAuth:
    def __init__(self, hashed_token: str | None = "hash-123") -> None:
        self.admin = SimpleNamespace(
            generate_link=lambda params: SimpleNamespace(
                properties=SimpleNamespace(hashed_token=hashed_token)
            )
        )


class _FakeAnonAuth:
    def __init__(self, session: object | None) -> None:
        self._session = session

    def verify_otp(self, params: dict) -> object:
        return SimpleNamespace(session=self._session)


def _admin_factory(hashed_token: str | None = "hash-123"):
    return lambda: SimpleNamespace(auth=_FakeAdminAuth(hashed_token))


def _anon_factory(session: object | None):
    return lambda: SimpleNamespace(auth=_FakeAnonAuth(session))


@pytest.fixture
def client():
    app.dependency_overrides[get_principal] = lambda: fake_principal(
        user_id="u1", email="ninja@example.com"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_mints_independent_session(client, monkeypatch):
    session = SimpleNamespace(
        access_token="acc-tok", refresh_token="ref-tok", expires_at=1234567890
    )
    monkeypatch.setattr(auth_router, "get_supabase_admin", _admin_factory())
    monkeypatch.setattr(auth_router, "get_supabase", _anon_factory(session))

    resp = client.post("/auth/extension-session")

    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"] == "acc-tok"
    assert body["refresh_token"] == "ref-tok"
    assert body["expires_at"] == 1234567890
    assert body["user_id"] == "u1"
    assert body["email"] == "ninja@example.com"


def test_requires_email(monkeypatch):
    app.dependency_overrides[get_principal] = lambda: Principal(id="u1", email=None)
    try:
        resp = TestClient(app).post("/auth/extension-session")
        assert resp.status_code == 400
    finally:
        app.dependency_overrides.clear()


def test_no_session_returns_502(client, monkeypatch):
    monkeypatch.setattr(auth_router, "get_supabase_admin", _admin_factory())
    monkeypatch.setattr(auth_router, "get_supabase", _anon_factory(None))

    resp = client.post("/auth/extension-session")
    assert resp.status_code == 502


def test_supabase_error_returns_502(client, monkeypatch):
    def _boom():
        raise RuntimeError("supabase down")

    monkeypatch.setattr(auth_router, "get_supabase_admin", _boom)
    resp = client.post("/auth/extension-session")
    assert resp.status_code == 502


def test_requires_auth():
    # No get_principal override → real dep runs → no bearer → 401 (HTTPBearer).
    resp = TestClient(app).post("/auth/extension-session")
    assert resp.status_code == 401
