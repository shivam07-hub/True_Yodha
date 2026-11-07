"""Clearing a held internship: a signed-in owner operator, from a screen."""
from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.database import get_supabase_admin
from app.main import app
from app.routers.growth import get_growth_operator
from app.schemas.growth import GrowthOperator
from tests.test_hosted_applicants import _DB


class _ReviewDB(_DB):
    def __init__(self, **tables) -> None:
        super().__init__(**tables)
        emails = {"poster": "founder@campusco.in"}
        self.auth = SimpleNamespace(
            admin=SimpleNamespace(
                get_user_by_id=lambda uid: SimpleNamespace(user=SimpleNamespace(email=emails.get(uid)))
            )
        )


def _held_db() -> _ReviewDB:
    return _ReviewDB(
        jobs=[
            {"job_id": "myro_1", "job_title": "Product intern", "company_name": "Campus Co",
             "listing_venue": "myro", "employment_kind": "internship", "created_by_user_id": "poster",
             "hosted_review": "pending", "is_active": False, "stipend_low_inr": 8000,
             "listing_confidence": "active", "first_seen": 20261108},
        ]
    )


def _as(role: str, db: _ReviewDB) -> TestClient:
    app.dependency_overrides[get_growth_operator] = lambda: GrowthOperator(
        user_id="op", role=role, active=True, display_name="Op"
    )
    app.dependency_overrides[get_supabase_admin] = lambda: db
    return TestClient(app)


def test_the_owner_sees_held_posts_with_who_posted_them() -> None:
    db = _held_db()
    try:
        with _as("owner", db) as client:
            res = client.get("/jobs/internships/review")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    [item] = res.json()["jobs"]
    assert item["job_id"] == "myro_1"
    assert item["poster_email"] == "founder@campusco.in"


def test_an_editor_cannot_clear_an_internship() -> None:
    db = _held_db()
    try:
        with _as("editor", db) as client:
            listed = client.get("/jobs/internships/review")
            cleared = client.post("/jobs/internships/myro_1/review", json={"decision": "clear"})
    finally:
        app.dependency_overrides.clear()
    assert listed.status_code == 403
    assert cleared.status_code == 403
    assert db.tables["jobs"][0]["is_active"] is False


def test_the_owner_clears_a_post_and_it_goes_live(monkeypatch) -> None:
    import app.routers.jobs.internships as routes

    told: list[str] = []
    # Never a real send from a test: local pytest loads the real .env.
    monkeypatch.setattr(routes, "tell_poster_live", lambda _db, card: told.append(card["job_id"]))
    db = _held_db()
    try:
        with _as("owner", db) as client:
            res = client.post("/jobs/internships/myro_1/review", json={"decision": "clear"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json()["hosted_review"] == "cleared"
    assert db.tables["jobs"][0]["is_active"] is True
    assert told == ["myro_1"]  # she hears it is live
