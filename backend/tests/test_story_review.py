"""Stories review space — payload assembly and the user's rulings."""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.career_reservoir import get_career_reservoir_repository
from app.repositories.story_identity import get_story_identity_repository
from app.services import story_identity, story_review

_H = {"Authorization": "Bearer t1"}


def _s(sid: str, title: str, role: str | None = None, status: str = "active") -> dict[str, Any]:
    return {"id": sid, "title": title, "role_id": role, "status": status}


def _p(pid: str, sid: str, text: str, canonical: bool = True) -> dict[str, Any]:
    return {"id": pid, "story_id": sid, "text": text, "is_canonical": canonical, "ordering": 0.0}


_ROLES = [
    {"id": "r1", "company": "Capgemini", "title": "E.L.I.T.E Trainee", "status": "active"},
    {"id": "r2", "company": "JLL", "title": "Data Engineer", "status": "archived"},
]


# ── the payload ──────────────────────────────────────────────────────────────

def test_a_pair_is_shown_with_both_sides_in_context():
    out = story_review.build_review(
        proposals=[{"story_a": "a", "story_b": "b"}],
        role_proposals=[], folds=[],
        stories=[_s("a", "Robotics POV", "r1"), _s("b", "Technology Matrix", "r1")],
        roles=_ROLES,
        pointers=[_p("p1", "a", "Authored the POV."), _p("p2", "a", "Wrote a POV.", False),
                  _p("p3", "b", "Built the matrix.")],
        user_ruled=3, tidied_roles=1,
    )
    pair = out["story_pairs"][0]
    assert pair["a"] == {"id": "a", "title": "Robotics POV", "role_label": "Capgemini — E.L.I.T.E Trainee",
                         "pointer": "Authored the POV.", "variant_count": 2}
    assert pair["b"]["variant_count"] == 1
    assert out["you_decided"] == 3 and out["tidied_roles"] == 1


def test_a_question_about_something_curated_away_is_not_asked():
    out = story_review.build_review(
        proposals=[{"story_a": "a", "story_b": "b"}],
        role_proposals=[{"role_a": "r1", "role_b": "r2"}], folds=[],
        stories=[_s("a", "A", "r1"), _s("b", "B", "r1", status="archived")],
        roles=_ROLES, pointers=[], user_ruled=0, tidied_roles=0,
    )
    assert out["story_pairs"] == []
    assert out["role_pairs"] == []  # r2 is archived


def test_merged_for_you_names_both_sides_and_only_while_still_folded():
    stories = [_s("k", "Kept one", "r1"), _s("d", "Merged one", "r1", status="archived"),
               _s("k2", "Other", "r1"), _s("d2", "Not folded any more", "r1")]
    folds = [
        {"story_a": "d", "story_b": "k", "keep_id": "k", "moved": {"dup_id": "d"}, "updated_at": "2026-09-12T10:00:00Z"},
        {"story_a": "d2", "story_b": "k2", "keep_id": "k2", "moved": {"dup_id": "d2"}, "updated_at": "2026-09-12T11:00:00Z"},
    ]
    out = story_review.build_review(
        proposals=[], role_proposals=[], folds=folds, stories=stories,
        roles=_ROLES, pointers=[], user_ruled=0, tidied_roles=0,
    )
    assert out["merged_for_you"] == [
        {"story_a": "d", "story_b": "k", "kept": "Kept one", "merged": "Merged one", "when": "2026-09-12T10:00:00Z"},
    ]


# ── the endpoints ────────────────────────────────────────────────────────────

class _FakeIdentityRepo:
    def __init__(self, **kw: Any) -> None:
        self.data = kw
        self.decided: list[tuple] = []
        self.undone: list[tuple] = []
        self.raise_on: str | None = None

    def proposals(self, user_id): return self.data.get("proposals", [])
    def recent_folds(self, user_id, days=30): return self.data.get("folds", [])
    def all_stories_brief(self, user_id): return self.data.get("stories", [])
    def all_story_pointers(self, user_id): return self.data.get("pointers", [])
    def user_ruled_count(self, user_id): return self.data.get("user_ruled", 0)


class _FakeCareerRepo:
    def __init__(self, roles=None, role_proposals=None) -> None:
        self.roles = roles or []
        self._role_proposals = role_proposals or []

    def list_roles(self, user_id): return self.roles
    def merge_proposals(self, user_id): return self._role_proposals
    def recent_auto_folds(self, user_id, days=7): return 0


def _override(identity: _FakeIdentityRepo, career: _FakeCareerRepo | None = None) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_story_identity_repository] = lambda: identity
    app.dependency_overrides[get_career_reservoir_repository] = lambda: career or _FakeCareerRepo()


@pytest.fixture(autouse=True)
def _clean_overrides():
    yield
    app.dependency_overrides.clear()


def test_review_returns_the_queue_and_asks_for_a_sweep(monkeypatch):
    asked: list[str] = []
    monkeypatch.setattr(story_identity, "maybe_enqueue", lambda uid: asked.append(uid) or True)
    _override(
        _FakeIdentityRepo(
            proposals=[{"story_a": "a", "story_b": "b"}],
            stories=[_s("a", "A", "r1"), _s("b", "B", "r1")],
            pointers=[_p("p1", "a", "Line A.")], user_ruled=2,
        ),
        _FakeCareerRepo(roles=_ROLES),
    )
    with TestClient(app) as client:
        resp = client.get("/cv/reservoir/review", headers=_H)
    assert resp.status_code == 200
    body = resp.json()
    assert [p["story_a"] for p in body["story_pairs"]] == ["a"]
    assert body["you_decided"] == 2 and asked == ["u1"]


def test_a_ruling_reaches_story_identity(monkeypatch):
    seen: list[tuple] = []
    monkeypatch.setattr(story_identity, "decide", lambda repo, uid, a, b, choice: seen.append((uid, a, b, choice)))
    _override(_FakeIdentityRepo())
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/review/stories",
                           json={"story_a": "a", "story_b": "b", "verdict": "merged"}, headers=_H)
    assert resp.status_code == 200 and resp.json() == {"verdict": "merged"}
    assert seen == [("u1", "a", "b", "merged")]


def test_an_unknown_verdict_is_rejected():
    _override(_FakeIdentityRepo())
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/review/stories",
                           json={"story_a": "a", "story_b": "b", "verdict": "whatever"}, headers=_H)
    assert resp.status_code == 422


def test_a_pair_that_changed_since_answers_409(monkeypatch):
    def _boom(*a, **kw):
        raise story_identity.StoryIdentityError("One of these entries has changed since. Refresh to see it.")
    monkeypatch.setattr(story_identity, "decide", _boom)
    _override(_FakeIdentityRepo())
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/review/stories",
                           json={"story_a": "a", "story_b": "b", "verdict": "merged"}, headers=_H)
    assert resp.status_code == 409 and "changed since" in resp.json()["detail"]


def test_undo_reaches_story_identity(monkeypatch):
    seen: list[tuple] = []
    monkeypatch.setattr(story_identity, "undo", lambda repo, uid, a, b: seen.append((uid, a, b)))
    _override(_FakeIdentityRepo())
    with TestClient(app) as client:
        resp = client.post("/cv/reservoir/review/stories/undo",
                           json={"story_a": "a", "story_b": "b"}, headers=_H)
    assert resp.status_code == 200 and seen == [("u1", "a", "b")]
