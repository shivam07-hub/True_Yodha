"""Story phrasings — promoting one line, dropping another.

A Career Story holds every way the user has written one achievement. The two
invariants live in SQL (20260912120000) — a story keeps exactly one canonical
phrasing, and never loses its last one — so what these tests pin is the
contract above them: the call reaches the right function, and a guard that
fires comes back as a 409 the user can act on, not a 500.
"""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.story_identity import get_story_identity_repository

_H = {"Authorization": "Bearer t1"}


class _FakeRepo:
    def __init__(self, error: str | None = None) -> None:
        self.error = error
        self.promoted: list[tuple[str, str]] = []
        self.dropped: list[tuple[str, str]] = []

    def _maybe_raise(self) -> None:
        if self.error:
            raise APIError({"message": self.error, "code": "P0001"})

    def promote_phrasing(self, user_id: str, point_id: str) -> None:
        self._maybe_raise()
        self.promoted.append((user_id, point_id))

    def drop_phrasing(self, user_id: str, point_id: str) -> None:
        self._maybe_raise()
        self.dropped.append((user_id, point_id))


def _override(repo: _FakeRepo) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_story_identity_repository] = lambda: repo


@pytest.fixture(autouse=True)
def _clean_overrides() -> Any:
    yield
    app.dependency_overrides.clear()


def test_promoting_a_phrasing_reaches_the_repository():
    repo = _FakeRepo()
    _override(repo)
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/phrasings/p1/promote", headers=_H)
    assert resp.status_code == 200 and resp.json() == {"ok": True}
    assert repo.promoted == [("u1", "p1")]


def test_dropping_a_phrasing_reaches_the_repository():
    repo = _FakeRepo()
    _override(repo)
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/phrasings/p2/drop", headers=_H)
    assert resp.status_code == 200
    assert repo.dropped == [("u1", "p2")]


def test_the_last_phrasing_is_refused_in_the_users_words():
    _override(_FakeRepo(error="story_pointer_drop: a story keeps its last phrasing — archive the story instead"))
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/phrasings/p1/drop", headers=_H)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "A story keeps its last line. Archive the story instead."


def test_a_phrasing_that_changed_since_is_refused():
    _override(_FakeRepo(error="story_pointer_promote: p9 is not an active phrasing of a story"))
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/phrasings/p9/promote", headers=_H)
    assert resp.status_code == 409
    assert "changed since" in resp.json()["detail"]
