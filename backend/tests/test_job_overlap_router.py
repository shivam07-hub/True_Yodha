"""Tests for GET /profile/{ninja_name}/overlap — job co-tracking surface."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import get_current_user
from app.main import app
from app.routers.profile import public as public_router


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Tape:
    """Records the current query path then returns canned data."""

    def __init__(self, table_data: dict[str, list[dict] | dict | None]) -> None:
        self._table_data = table_data
        self._table: str | None = None
        self._user_filter: str | None = None

    def table(self, name: str) -> "_Tape":
        self._table = name
        self._user_filter = None
        return self

    def select(self, *_a: Any, **_kw: Any) -> "_Tape":
        return self

    def eq(self, col: str, val: Any) -> "_Tape":
        if col == "user_id":
            self._user_filter = val
        return self

    def in_(self, _col: str, _vals: list[Any]) -> "_Tape":
        return self

    def limit(self, _n: int) -> "_Tape":
        return self

    def maybe_single(self) -> "_Tape":
        return self

    def execute(self) -> _Result:
        if self._table is None:
            return _Result(None)
        if self._table == "user_profiles":
            # Used by nn.resolve_user_id_by_name → maybe_single → return dict
            return _Result(self._table_data.get("user_profiles"))
        if self._table in ("job_applications", "user_job_matches"):
            rows = self._table_data.get(self._table, []) or []
            return _Result([r for r in rows if r.get("user_id") == self._user_filter])
        if self._table == "jobs":
            return _Result(self._table_data.get("jobs") or [])
        if self._table == "public_profile_v":
            return _Result(self._table_data.get("public_profile_v"))
        return _Result(None)


@pytest.fixture
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


def _make_admin(table_data: dict[str, Any]) -> _Tape:
    return _Tape(table_data)


def test_overlap_returns_intersection_with_owner(monkeypatch: Any, _clear_overrides: Any) -> None:
    table_data = {
        "user_profiles": {"id": "owner-u"},
        "job_applications": [
            {"user_id": "owner-u", "job_id": "j1", "status": "applied"},
            {"user_id": "owner-u", "job_id": "j2", "status": "interviewing"},
            {"user_id": "viewer-u", "job_id": "j1", "status": "screening"},
            {"user_id": "viewer-u", "job_id": "j3", "status": "saved"},
        ],
        "jobs": [
            {"job_id": "j1", "job_title": "ML Eng", "company_name": "Acme"},
        ],
        "user_job_matches": [
            {"user_id": "viewer-u", "job_id": "j1", "overlap_score": 78},
            {"user_id": "owner-u", "job_id": "j1", "overlap_score": 65},
        ],
    }
    monkeypatch.setattr(public_router, "_admin", lambda: _make_admin(table_data))
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "viewer-u", "token": "t"}

    with TestClient(app) as client:
        response = client.get("/profile/silent-fox-9k2x/overlap")

    assert response.status_code == 200
    body = response.json()
    assert len(body["rows"]) == 1
    row = body["rows"][0]
    assert row["job_id"] == "j1"
    assert row["role"] == "ML Eng"
    assert row["company_name"] == "Acme"
    assert row["viewer_match_pct"] == 78
    assert row["owner_match_pct"] == 65


def test_overlap_returns_empty_when_no_shared_jobs(monkeypatch: Any, _clear_overrides: Any) -> None:
    table_data = {
        "user_profiles": {"id": "owner-u"},
        "job_applications": [
            {"user_id": "owner-u", "job_id": "j1", "status": "applied"},
            {"user_id": "viewer-u", "job_id": "j2", "status": "applied"},
        ],
        "jobs": [],
        "user_job_matches": [],
    }
    monkeypatch.setattr(public_router, "_admin", lambda: _make_admin(table_data))
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "viewer-u", "token": "t"}

    with TestClient(app) as client:
        response = client.get("/profile/silent-fox-9k2x/overlap")

    assert response.status_code == 200
    assert response.json() == {"rows": []}


def test_overlap_self_returns_empty(monkeypatch: Any, _clear_overrides: Any) -> None:
    """Owner viewing their own profile sees no overlap."""
    table_data = {
        "user_profiles": {"id": "same-u"},
        "job_applications": [],
        "jobs": [],
        "user_job_matches": [],
    }
    monkeypatch.setattr(public_router, "_admin", lambda: _make_admin(table_data))
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "same-u", "token": "t"}

    with TestClient(app) as client:
        response = client.get("/profile/silent-fox-9k2x/overlap")

    assert response.status_code == 200
    assert response.json() == {"rows": []}


def test_overlap_caps_at_three_rows_sorted_by_viewer_pct(monkeypatch: Any, _clear_overrides: Any) -> None:
    table_data = {
        "user_profiles": {"id": "owner-u"},
        "job_applications": [
            {"user_id": "owner-u",  "job_id": "j1", "status": "applied"},
            {"user_id": "owner-u",  "job_id": "j2", "status": "applied"},
            {"user_id": "owner-u",  "job_id": "j3", "status": "applied"},
            {"user_id": "owner-u",  "job_id": "j4", "status": "applied"},
            {"user_id": "viewer-u", "job_id": "j1", "status": "applied"},
            {"user_id": "viewer-u", "job_id": "j2", "status": "applied"},
            {"user_id": "viewer-u", "job_id": "j3", "status": "applied"},
            {"user_id": "viewer-u", "job_id": "j4", "status": "applied"},
        ],
        "jobs": [
            {"job_id": "j1", "job_title": "A", "company_name": "X"},
            {"job_id": "j2", "job_title": "B", "company_name": "X"},
            {"job_id": "j3", "job_title": "C", "company_name": "X"},
            {"job_id": "j4", "job_title": "D", "company_name": "X"},
        ],
        "user_job_matches": [
            {"user_id": "viewer-u", "job_id": "j1", "overlap_score": 20},
            {"user_id": "viewer-u", "job_id": "j2", "overlap_score": 80},
            {"user_id": "viewer-u", "job_id": "j3", "overlap_score": 50},
            {"user_id": "viewer-u", "job_id": "j4", "overlap_score": 90},
        ],
    }
    monkeypatch.setattr(public_router, "_admin", lambda: _make_admin(table_data))
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "viewer-u", "token": "t"}

    with TestClient(app) as client:
        response = client.get("/profile/silent-fox-9k2x/overlap")

    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) == 3
    # Sorted by viewer_match_pct desc
    assert [r["job_id"] for r in rows] == ["j4", "j2", "j3"]
