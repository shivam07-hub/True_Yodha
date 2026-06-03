"""Tests for routers/profile/public.py — public profile + ninja-name endpoints.

PII discipline test: the public payload MUST NOT contain email, full_name,
linkedin_url, or skill names. The view is the gate but we re-assert here so a
future schema change can't accidentally leak fields.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.routers.profile import public as public_router


# ── Fake admin client ──────────────────────────────────────────────────────


class _Chain:
    """A flexible PostgREST-call recorder.

    Build a chain of method calls (.table().select().eq().execute()) and
    return whatever data the test wired up via `routes`.
    """

    def __init__(self, routes: dict[str, Any]) -> None:
        self._routes = routes
        self._table: str | None = None
        self._filters: list[tuple[str, str]] = []

    def table(self, name: str) -> "_Chain":
        self._table = name
        self._filters = []
        return self

    def select(self, *_a: Any, **_kw: Any) -> "_Chain":
        return self

    def eq(self, col: str, val: Any) -> "_Chain":
        self._filters.append((col, val))
        return self

    def in_(self, col: str, vals: list[Any]) -> "_Chain":
        self._filters.append((col, tuple(vals)))
        return self

    def limit(self, _n: int) -> "_Chain":
        return self

    def order(self, *_a: Any, **_kw: Any) -> "_Chain":
        return self

    def maybe_single(self) -> "_Chain":
        return self

    def update(self, _payload: dict) -> "_Chain":
        self._captured_update = _payload  # noqa
        return self

    def execute(self) -> Any:
        spec = self._routes.get(self._table) or {}
        return _Result(spec.get("data"))


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


def _admin_with(routes: dict[str, Any]) -> _Chain:
    return _Chain(routes)


@pytest.fixture
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


# ── Public profile ─────────────────────────────────────────────────────────


def test_get_public_profile_returns_no_pii(monkeypatch: Any, _clear_overrides: Any) -> None:
    """Even if the view ever leaks PII, the router strips it via PublicProfile."""
    leaky_row = {
        "ninja_name": "silent-fox-9k2x",
        "mirror_score": 72.5,
        "domain_scores": {"Engineering": 80.0},
        "tier_label": "Competent",
        "forge_sessions_count": 5,
        "diary_count": 3,
        "tracker_count": 12,
        # Should never be returned — defensive checks below.
        "email": "leak@example.com",
        "full_name": "Real Name",
        "linkedin_url": "https://linkedin.com/in/leak",
        "cv_text": "Private CV body",
        "skill_names": ["Python"],
        "skill_levels": {"Python": 3},
        "tracker_rows": [{"company_name": "Private Co"}],
    }
    monkeypatch.setattr(public_router, "_admin", lambda: _admin_with({"public_profile_v": {"data": leaky_row}}))

    with TestClient(app) as client:
        response = client.get("/profile/silent-fox-9k2x")

    assert response.status_code == 200
    body = response.json()
    assert body["ninja_name"] == "silent-fox-9k2x"
    assert body["mirror_score"] == 72.5
    assert "email" not in body
    assert "full_name" not in body
    assert "linkedin_url" not in body
    assert "cv_text" not in body
    assert "skill_names" not in body
    assert "skill_levels" not in body
    assert "tracker_rows" not in body


def test_get_public_profile_404_when_missing(monkeypatch: Any) -> None:
    monkeypatch.setattr(public_router, "_admin", lambda: _admin_with({"public_profile_v": {"data": None}}))
    with TestClient(app) as client:
        response = client.get("/profile/silent-fox-9k2x")
    assert response.status_code == 404


def test_get_public_profile_404_when_name_invalid(monkeypatch: Any) -> None:
    monkeypatch.setattr(public_router, "_admin", lambda: _admin_with({}))
    with TestClient(app) as client:
        # Reserved name → 404, never reaches DB.
        response = client.get("/profile/admin")
    assert response.status_code == 404


# ── ninja-name self-management ─────────────────────────────────────────────


def test_update_ninja_name_rejects_invalid(_clear_overrides: Any) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t")
    with TestClient(app) as client:
        response = client.post("/profile/ninja-name", json={"ninja_name": "ab"})
    assert response.status_code == 422


def test_update_ninja_name_rejects_reserved(_clear_overrides: Any) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t")
    with TestClient(app) as client:
        response = client.post("/profile/ninja-name", json={"ninja_name": "admin"})
    assert response.status_code == 422


def test_update_ninja_name_conflict_on_taken(monkeypatch: Any, _clear_overrides: Any) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t")

    def fake_admin() -> _Chain:
        # current row returns a *different* current name; lookup returns existing row.
        return _Chain({
            "user_profiles": {"data": {"ninja_name": "my-old-name-xxxx"}},
        })

    # is_available looks up user_profiles for the candidate; force "taken".
    monkeypatch.setattr(public_router, "_admin", fake_admin)
    monkeypatch.setattr(public_router.nn, "is_available", lambda name, admin=None: False)

    with TestClient(app) as client:
        response = client.post("/profile/ninja-name", json={"ninja_name": "taken-name-ab12"})
    assert response.status_code == 409
