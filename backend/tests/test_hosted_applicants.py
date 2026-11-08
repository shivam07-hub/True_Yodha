"""The recruiter reads applicants only for an internship she posted."""
from __future__ import annotations

from typing import Any

import pytest

from app.services.hosted_applicants import (
    NotYourPost,
    applicants,
    decide,
    my_posts,
    open_applicant,
)


class _Query:
    def __init__(self, db: "_DB", table: str) -> None:
        self.db, self.table = db, table
        self.preds: list = []
        self.patch: dict | None = None
        self._negate = False
        self._limit: int | None = None

    @property
    def not_(self) -> "_Query":
        self._negate = True
        return self

    def select(self, *_: Any) -> "_Query":
        return self

    def update(self, patch: dict) -> "_Query":
        self.patch = patch
        return self

    def _add(self, fn) -> "_Query":
        negate, self._negate = self._negate, False
        self.preds.append((lambda r: not fn(r)) if negate else fn)
        return self

    def eq(self, col: str, val: Any) -> "_Query":
        return self._add(lambda r: r.get(col) == val)

    def in_(self, col: str, vals: list) -> "_Query":
        return self._add(lambda r: r.get(col) in vals)

    def is_(self, col: str, val: str) -> "_Query":
        assert val == "null"
        return self._add(lambda r: r.get(col) is None)

    def order(self, *_: Any, **__: Any) -> "_Query":
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    def execute(self) -> "_Query":
        rows = [r for r in self.db.tables[self.table] if all(p(r) for p in self.preds)]
        if self.patch is not None:
            for r in rows:
                r.update(self.patch)
        self.data = [dict(r) for r in rows][: self._limit]
        return self


class _DB:
    def __init__(self, **tables: list[dict]) -> None:
        self.tables = tables

    def table(self, name: str) -> _Query:
        return _Query(self, name)


def _db() -> _DB:
    return _DB(
        jobs=[
            {"job_id": "myro_1", "job_title": "Product intern", "company_name": "Campus Co",
             "listing_venue": "myro", "employment_kind": "internship", "created_by_user_id": "poster",
             "hosted_review": "cleared", "is_active": True, "stipend_low_inr": 8000},
            {"job_id": "myro_2", "job_title": "Ops intern", "company_name": "Other Co",
             "listing_venue": "myro", "employment_kind": "internship", "created_by_user_id": "someone_else",
             "hosted_review": "cleared", "is_active": True, "stipend_low_inr": 9000},
        ],
        job_applications=[
            {"id": 11, "user_id": "seeker", "job_id": "myro_1", "applied_at": "2026-11-08T10:00:00Z",
             "employer_status": None},
            {"id": 12, "user_id": "saver", "job_id": "myro_1", "applied_at": None, "employer_status": None},
            {"id": 13, "user_id": "seeker", "job_id": "myro_2", "applied_at": "2026-11-08T11:00:00Z",
             "employer_status": None},
        ],
        user_profiles=[{"id": "seeker", "full_name": "Asha K"}, {"id": "saver", "full_name": "Ravi"}],
        cv_application_attempts=[
            {"user_id": "seeker", "job_id": "myro_1", "submitted_at": "2026-11-08T10:00:00Z",
             "cv_snapshot": {"title": "Product intern", "structured": {"contact": {"name": "Asha K"}}}},
        ],
        mirror_scores=[{"user_id": "seeker", "total_score": 61.5, "rank_tier": "never-shown"}],
        user_skills=[{"user_id": "seeker", "confidence": 0.9, "skills": {"display_name": "SQL (Programming Language)"}}],
    )


def test_her_posts_count_only_sent_applications() -> None:
    posts = my_posts(_db(), "poster")
    assert [p["job_id"] for p in posts] == ["myro_1"]
    assert posts[0]["applicant_count"] == 1  # the saved-not-sent row is not an applicant


def test_she_cannot_read_applicants_of_a_post_she_did_not_make() -> None:
    db = _db()
    with pytest.raises(NotYourPost):
        applicants(db, "poster", "myro_2")
    with pytest.raises(NotYourPost):
        open_applicant(db, "poster", "myro_2", 13)


def test_an_application_to_another_post_cannot_be_opened_through_hers() -> None:
    with pytest.raises(NotYourPost):
        open_applicant(_db(), "poster", "myro_1", 13)


def test_opening_an_applicant_marks_him_seen_and_shows_the_cv_he_sent() -> None:
    db = _db()
    seen = open_applicant(db, "poster", "myro_1", 11)
    assert seen["employer_status"] == "seen"
    assert seen["cv"]["structured"]["contact"]["name"] == "Asha K"
    assert seen["score"] == 61.5
    assert seen["skills"] == ["SQL (Programming Language)"]
    assert "rank_tier" not in str(seen)
    stored = db.tables["job_applications"][0]
    assert stored["employer_status"] == "seen"
    assert stored["applied_at"] == "2026-11-08T10:00:00Z"  # his Yes is untouched


def test_her_decision_sits_beside_his_record() -> None:
    db = _db()
    assert decide(db, "poster", "myro_1", 11, "shortlisted") == "shortlisted"
    stored = db.tables["job_applications"][0]
    assert stored["employer_status"] == "shortlisted"
    assert stored["applied_at"] == "2026-11-08T10:00:00Z"
    with pytest.raises(ValueError):
        decide(db, "poster", "myro_1", 11, "hired")


def test_opening_again_does_not_undo_a_decision() -> None:
    db = _db()
    decide(db, "poster", "myro_1", 11, "passed")
    assert open_applicant(db, "poster", "myro_1", 11)["employer_status"] == "passed"


def _client_as(user_id: str, db: _DB):
    from fastapi.testclient import TestClient

    from app.database import get_supabase_admin
    from app.deps import Principal, get_principal
    from app.main import app

    app.dependency_overrides[get_principal] = lambda: Principal(id=user_id)
    app.dependency_overrides[get_supabase_admin] = lambda: db
    return app, TestClient(app)


def test_routes_read_mine_as_her_home_and_hide_a_cv_from_a_stranger() -> None:
    db = _db()
    app, client = _client_as("poster", db)
    try:
        with client:
            mine = client.get("/jobs/internships/mine")
            _client_as("stranger", db)  # same app, principal swapped
            blocked = client.get("/jobs/internships/myro_1/applicants/11")
    finally:
        app.dependency_overrides.clear()
    assert mine.status_code == 200
    assert [j["job_id"] for j in mine.json()["jobs"]] == ["myro_1"]
    assert blocked.status_code == 404
    assert db.tables["job_applications"][0]["employer_status"] is None  # a stranger never marks seen
