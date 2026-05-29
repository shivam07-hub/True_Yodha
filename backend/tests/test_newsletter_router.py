"""Tests for routers/newsletter.py — POST /newsletter/subscribe.

Covers:
- happy path persists a normalised email + source + ip and returns ok
- duplicate email is idempotent (already_subscribed, no second insert)
- invalid email is rejected (422)
- IP rate-limit returns 429 once the hourly cap is hit
- unique-violation race during insert is treated as already_subscribed
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import newsletter as newsletter_router


class _Chain:
    """Minimal Supabase mock: rpc(), table().select().eq().limit().execute(),
    table().insert().execute()."""

    def __init__(self, *, rate_count: int = 0, existing: list[dict] | None = None,
                 insert_raises: Exception | None = None) -> None:
        self._rate_count = rate_count
        self._existing = existing or []
        self._insert_raises = insert_raises
        self._mode: str | None = None
        self.inserted: dict | None = None

    # rpc — rate-limit counter
    def rpc(self, name: str, params: dict) -> "_Chain":
        self._mode = "rpc"
        return self

    def table(self, name: str) -> "_Chain":
        self._mode = None
        return self

    def select(self, *_a: Any, **_k: Any) -> "_Chain":
        self._mode = "select"
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_Chain":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_Chain":
        return self

    def insert(self, payload: dict) -> "_Chain":
        self._mode = "insert"
        self.inserted = payload
        return self

    def execute(self) -> Any:
        if self._mode == "rpc":
            return _Result(self._rate_count)
        if self._mode == "select":
            return _Result(self._existing)
        if self._mode == "insert":
            if self._insert_raises is not None:
                raise self._insert_raises
            row = {**(self.inserted or {}), "id": "00000000-0000-0000-0000-000000000001"}
            return _Result([row])
        return _Result(None)


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


@pytest.fixture
def patch_admin(monkeypatch: pytest.MonkeyPatch):
    def _apply(chain: _Chain) -> _Chain:
        monkeypatch.setattr(newsletter_router, "get_supabase_admin", lambda: chain)
        return chain

    return _apply


def test_subscribe_happy_path(patch_admin) -> None:
    chain = patch_admin(_Chain())

    with TestClient(app) as client:
        response = client.post("/newsletter/subscribe", json={"email": "Foo@Bar.com"})

    assert response.status_code == 201, response.text
    assert response.json() == {"ok": True, "already_subscribed": False}
    assert chain.inserted is not None
    assert chain.inserted["email"] == "foo@bar.com"  # normalised
    assert chain.inserted["source"] == "web"
    assert chain.inserted["ip"]  # captured server-side


def test_subscribe_idempotent_on_duplicate(patch_admin) -> None:
    chain = patch_admin(_Chain(existing=[{"id": "x", "status": "subscribed"}]))

    with TestClient(app) as client:
        response = client.post(
            "/newsletter/subscribe",
            json={"email": "dup@bar.com", "source": "landing"},
        )

    assert response.status_code == 201, response.text
    assert response.json()["already_subscribed"] is True
    assert chain.inserted is None  # no second insert


def test_subscribe_rejects_invalid_email(patch_admin) -> None:
    patch_admin(_Chain())

    with TestClient(app) as client:
        response = client.post("/newsletter/subscribe", json={"email": "not-an-email"})

    assert response.status_code == 422, response.text


def test_subscribe_rate_limited(patch_admin) -> None:
    patch_admin(_Chain(rate_count=10))

    with TestClient(app) as client:
        response = client.post("/newsletter/subscribe", json={"email": "spam@bar.com"})

    assert response.status_code == 429, response.text


def test_subscribe_unique_violation_race(patch_admin) -> None:
    chain = patch_admin(_Chain(insert_raises=Exception("duplicate key value violates unique constraint")))

    with TestClient(app) as client:
        response = client.post("/newsletter/subscribe", json={"email": "race@bar.com"})

    assert response.status_code == 201, response.text
    assert response.json()["already_subscribed"] is True


def test_subscribe_rejects_unknown_source(patch_admin) -> None:
    patch_admin(_Chain())

    with TestClient(app) as client:
        response = client.post(
            "/newsletter/subscribe",
            json={"email": "ok@bar.com", "source": "carrier-pigeon"},
        )

    assert response.status_code == 422, response.text
