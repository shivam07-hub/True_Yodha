"""Partner API key resolution and scope enforcement.

Partner routes carry no RLS — the scope check and the `partner_id` filter ARE the
tenancy boundary. A route that loses its `require_scope` dependency stops being a
style problem and becomes a cross-tenant read.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import partners as partners_module
from app.repositories.partners import PartnerCredential, PartnersRepository
from app.security import partner_auth
from app.security.partner_auth import get_partner_credential


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Chain:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def table(self, _name: str) -> "_Chain":
        return self

    def select(self, *_a: Any, **_k: Any) -> "_Chain":
        return self

    def eq(self, *_a: Any) -> "_Chain":
        return self

    def limit(self, _n: int) -> "_Chain":
        return self

    def update(self, *_a: Any, **_k: Any) -> "_Chain":
        return self

    def execute(self) -> _Result:
        return _Result(self.rows)


ACTIVE_PARTNER = {"slug": "acme", "name": "Acme", "status": "active"}


def _key_row(raw: str, prefix: str, **over: Any) -> dict:
    row = {
        "id": "k1",
        "partner_id": "p1",
        "key_hash": partners_module.hash_key(raw),
        "scopes": ["sso"],
        "revoked_at": None,
        "partners": ACTIVE_PARTNER,
    }
    row.update(over)
    return row


def test_generated_key_round_trips():
    raw, prefix, key_hash = partners_module.generate_key()

    assert partners_module.parse_key_prefix(raw) == prefix
    assert partners_module.hash_key(raw) == key_hash
    assert raw.startswith("myro_live_")


@pytest.mark.parametrize(
    "bad", ["", "nope", "myro_live_onlythree", "bearer myro_live_a_b", "myro__a_b"]
)
def test_malformed_keys_have_no_prefix(bad):
    assert partners_module.parse_key_prefix(bad) is None


def test_wrong_secret_with_a_valid_prefix_is_rejected():
    raw, prefix, _ = partners_module.generate_key()
    forged = f"myro_live_{prefix}_{'0' * 64}"
    repo = PartnersRepository(_Chain([_key_row(raw, prefix)]))

    assert repo.resolve_credential(forged) is None
    assert repo.resolve_credential(raw) is not None


def test_revoked_key_is_rejected():
    raw, prefix, _ = partners_module.generate_key()
    repo = PartnersRepository(_Chain([_key_row(raw, prefix, revoked_at="2026-01-01T00:00:00Z")]))

    assert repo.resolve_credential(raw) is None


def test_suspended_partner_is_rejected():
    raw, prefix, _ = partners_module.generate_key()
    repo = PartnersRepository(
        _Chain([_key_row(raw, prefix, partners={**ACTIVE_PARTNER, "status": "suspended"})])
    )

    assert repo.resolve_credential(raw) is None


def test_unknown_prefix_is_rejected():
    raw, _, _ = partners_module.generate_key()
    repo = PartnersRepository(_Chain([]))

    assert repo.resolve_credential(raw) is None


# ── route-level ────────────────────────────────────────────────────────────


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_missing_key_is_401(client):
    response = client.post("/partner/v1/sso/session", json={
        "external_id": "e1", "email": "a@b.co",
    })
    assert response.status_code == 401


def test_key_without_the_scope_is_403(client, monkeypatch):
    monkeypatch.setattr(partner_auth, "_enforce_rate_limit", lambda _key_id: None)
    app.dependency_overrides[get_partner_credential] = lambda: PartnerCredential(
        key_id="k1", partner_id="p1", slug="acme", name="Acme",
        scopes=frozenset({"jobs.read"}),   # no 'sso'
    )

    response = client.post("/partner/v1/sso/session", json={
        "external_id": "e1", "email": "a@b.co",
    })

    assert response.status_code == 403
    assert "sso" in response.json()["detail"]


def test_every_partner_route_requires_a_scope():
    """A new route that forgets `require_scope` is a cross-tenant read waiting to
    happen. Assert the dependency is present on all of them."""
    partner_routes = [r for r in app.routes if getattr(r, "path", "").startswith("/partner/v1")]
    assert partner_routes
    for route in partner_routes:
        names = [
            getattr(d.call, "__qualname__", "")
            for d in route.dependant.dependencies
        ] + [getattr(route.dependant.call, "__qualname__", "")]
        flat = " ".join(names)
        assert "require_scope" in flat or any(
            "require_scope" in getattr(sub.call, "__qualname__", "")
            for dep in route.dependant.dependencies
            for sub in [dep]
        ), f"{route.path} has no scope dependency"
