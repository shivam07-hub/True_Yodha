"""Tests for routers/institutions.py — placement-cell beta applications.

Covers POST /institutions/apply:
- happy path persists the row and returns the new id
- personal-email domains are rejected (422)
- invalid institute_type / students_per_year enums are rejected (422)
- email is normalised (lowercased/trimmed) before insert
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import institutions as institutions_router


class _Chain:
    def __init__(self, routes: dict[str, Any]) -> None:
        self._routes = routes
        self._table: str | None = None
        self._inserted: dict | None = None

    def table(self, name: str) -> "_Chain":
        self._table = name
        self._inserted = None
        return self

    def insert(self, payload: dict) -> "_Chain":
        self._inserted = payload
        return self

    def execute(self) -> Any:
        spec = self._routes.get(self._table) or {}
        row = {**(self._inserted or {})}
        row.setdefault("id", spec.get("inserted_id", 1))
        return _Result([row])


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


@pytest.fixture
def patch_admin(monkeypatch: pytest.MonkeyPatch):
    def _apply(routes: dict[str, Any]) -> _Chain:
        chain = _Chain(routes)
        monkeypatch.setattr(institutions_router, "get_supabase_admin", lambda: chain)
        return chain

    return _apply


def _valid_body(**overrides: Any) -> dict:
    body = {
        "institute_name": "IIIT Hyderabad",
        "contact_name": "Dr. R. Sharma",
        "contact_title": "T&P Officer / Head",
        "email": "Placement@IIIT.ac.in",
        "institute_type": "IIT / IIM / NIT / IIIT",
        "students_per_year": "1,000 – 5,000",
        "primary_need": "Placement analytics dashboard",
    }
    body.update(overrides)
    return body


def test_apply_happy_path(patch_admin) -> None:
    chain = patch_admin({"institution_applications": {"inserted_id": 42}})

    with TestClient(app) as client:
        response = client.post("/institutions/apply", json=_valid_body())

    assert response.status_code == 201, response.text
    assert response.json() == {"ok": True, "id": 42}
    assert chain._inserted is not None
    # email normalised
    assert chain._inserted["email"] == "placement@iiit.ac.in"
    assert chain._inserted["institute_name"] == "IIIT Hyderabad"


def test_apply_rejects_personal_email(patch_admin) -> None:
    patch_admin({"institution_applications": {"inserted_id": 1}})

    with TestClient(app) as client:
        response = client.post(
            "/institutions/apply",
            json=_valid_body(email="someone@gmail.com"),
        )

    assert response.status_code == 422, response.text
    assert "institutional email" in response.json()["detail"].lower()


def test_apply_rejects_unknown_institute_type(patch_admin) -> None:
    patch_admin({"institution_applications": {"inserted_id": 1}})

    with TestClient(app) as client:
        response = client.post(
            "/institutions/apply",
            json=_valid_body(institute_type="Hogwarts"),
        )

    assert response.status_code == 422


def test_apply_rejects_unknown_size(patch_admin) -> None:
    patch_admin({"institution_applications": {"inserted_id": 1}})

    with TestClient(app) as client:
        response = client.post(
            "/institutions/apply",
            json=_valid_body(students_per_year="a lot"),
        )

    assert response.status_code == 422


def test_apply_accepts_sso_provider(patch_admin) -> None:
    chain = patch_admin({"institution_applications": {"inserted_id": 7}})

    with TestClient(app) as client:
        response = client.post(
            "/institutions/apply",
            json=_valid_body(sso_provider="google-edu"),
        )

    assert response.status_code == 201, response.text
    assert chain._inserted["sso_provider"] == "google-edu"


def test_apply_primary_need_optional(patch_admin) -> None:
    chain = patch_admin({"institution_applications": {"inserted_id": 8}})
    body = _valid_body()
    del body["primary_need"]

    with TestClient(app) as client:
        response = client.post("/institutions/apply", json=body)

    assert response.status_code == 201, response.text
    assert chain._inserted["primary_need"] is None
