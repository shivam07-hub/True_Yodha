from datetime import datetime, timezone
from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, Principal, get_current_user, get_principal_optional
from app.main import app
from app.repositories.comments import (
    get_public_comments_repository,
    get_token_comments_repository,
)


def _row(**overrides: Any) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = {
        "id": "c1",
        "user_id": "u1",
        "entity_type": "skill",
        "entity_id": "data-analysis",
        "body": "ran the steering review",
        "status": "visible",
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakeTokenRepo:
    """Stands in for the own-only token CRUD repo."""

    def __init__(self) -> None:
        self.created: dict[str, Any] | None = None
        self.update_hit = True
        self.delete_hit = True

    def create(self, user_id: str, entity_type: str, entity_id: str, body: str) -> dict[str, Any]:
        self.created = {"user_id": user_id, "entity_type": entity_type, "entity_id": entity_id, "body": body}
        return _row(user_id=user_id, entity_type=entity_type, entity_id=entity_id, body=body)

    def update(self, _user_id: str, comment_id: str, body: str) -> dict[str, Any] | None:
        return _row(id=comment_id, body=body) if self.update_hit else None

    def delete(self, _user_id: str, _comment_id: str) -> bool:
        return self.delete_hit


class _FakePublicRepo:
    """Stands in for the service-role public read/flag repo."""

    def __init__(self) -> None:
        self.rows = [
            _row(id="c1", user_id="u1", body="great team"),
            _row(id="c2", user_id="u2", body="ghosted me"),
        ]
        self.over_limit = False
        self.visible_for_flag: dict[str, Any] | None = _row(id="c2", user_id="u2")
        self.flag_result = {"report_count": 1, "status": "visible"}

    def list_visible(self, entity_type: str, entity_id: str) -> list[dict[str, Any]]:
        return [_row(**{**r, "entity_type": entity_type, "entity_id": entity_id}) for r in self.rows]

    def ninja_names_for(self, user_ids: list[str]) -> dict[str, str | None]:
        names = {"u1": "silent-fox-9k2x", "u2": None}
        return {uid: names.get(uid) for uid in user_ids}

    def over_daily_limit(self, _user_id: str) -> bool:
        return self.over_limit

    def get_visible(self, _comment_id: str) -> dict[str, Any] | None:
        return self.visible_for_flag

    def record_flag(self, _comment_id: str, _flagger_id: str) -> dict[str, Any]:
        return self.flag_result


def _override(*, token_repo=None, public_repo=None, viewer: str | None = "u1") -> None:
    if token_repo is not None:
        app.dependency_overrides[get_token_comments_repository] = lambda: token_repo
    if public_repo is not None:
        app.dependency_overrides[get_public_comments_repository] = lambda: public_repo
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email=None, token="t1")
    app.dependency_overrides[get_principal_optional] = lambda: (
        Principal(id=viewer, email=None) if viewer else None
    )


# ── Public read ──────────────────────────────────────────────────────────────

def test_list_is_public_and_returns_ninja_name() -> None:
    _override(public_repo=_FakePublicRepo(), viewer=None)  # anonymous
    try:
        with TestClient(app) as client:
            res = client.get("/comments", params={"entity_type": "company", "entity_id": "Stripe"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    first = body["comments"][0]
    assert first["author_ninja_name"] == "silent-fox-9k2x"
    assert first["is_own"] is False  # anonymous viewer owns nothing
    assert "user_id" not in first  # identity never leaked


def test_list_marks_viewers_own_notes() -> None:
    _override(public_repo=_FakePublicRepo(), viewer="u1")
    try:
        with TestClient(app) as client:
            res = client.get("/comments", params={"entity_type": "company", "entity_id": "Stripe"})
    finally:
        app.dependency_overrides.clear()
    comments = {c["id"]: c for c in res.json()["comments"]}
    assert comments["c1"]["is_own"] is True   # authored by u1
    assert comments["c2"]["is_own"] is False  # authored by u2


def test_anonymous_author_falls_back_to_null_name() -> None:
    _override(public_repo=_FakePublicRepo(), viewer=None)
    try:
        with TestClient(app) as client:
            res = client.get("/comments", params={"entity_type": "company", "entity_id": "Stripe"})
    finally:
        app.dependency_overrides.clear()
    c2 = next(c for c in res.json()["comments"] if c["id"] == "c2")
    assert c2["author_ninja_name"] is None  # UI renders "A Myro user"


# ── Create (multi-note + rate limit) ─────────────────────────────────────────

def test_create_comment_passes_principal_id() -> None:
    token_repo = _FakeTokenRepo()
    _override(token_repo=token_repo, public_repo=_FakePublicRepo())
    try:
        with TestClient(app) as client:
            res = client.post("/comments", json={"entity_type": "job", "entity_id": "job-42", "body": "applied today"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 201
    assert token_repo.created == {"user_id": "u1", "entity_type": "job", "entity_id": "job-42", "body": "applied today"}
    assert res.json()["is_own"] is True


def test_create_blocked_over_daily_limit() -> None:
    public = _FakePublicRepo()
    public.over_limit = True
    _override(token_repo=_FakeTokenRepo(), public_repo=public)
    try:
        with TestClient(app) as client:
            res = client.post("/comments", json={"entity_type": "job", "entity_id": "j", "body": "spam"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 429


def test_create_rejects_empty_body() -> None:
    _override(token_repo=_FakeTokenRepo(), public_repo=_FakePublicRepo())
    try:
        with TestClient(app) as client:
            res = client.post("/comments", json={"entity_type": "skill", "entity_id": "x", "body": "   "})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 422


# ── Update / delete (own-only) ───────────────────────────────────────────────

def test_update_404_when_not_owned() -> None:
    token_repo = _FakeTokenRepo()
    token_repo.update_hit = False
    _override(token_repo=token_repo, public_repo=_FakePublicRepo())
    try:
        with TestClient(app) as client:
            res = client.patch("/comments/c9", json={"body": "edit"})
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 404


def test_delete_204_then_404() -> None:
    token_repo = _FakeTokenRepo()
    _override(token_repo=token_repo)
    try:
        with TestClient(app) as client:
            ok = client.delete("/comments/c1")
        token_repo.delete_hit = False
        _override(token_repo=token_repo)
        with TestClient(app) as client:
            missing = client.delete("/comments/c1")
    finally:
        app.dependency_overrides.clear()
    assert ok.status_code == 204
    assert missing.status_code == 404


# ── Flag ─────────────────────────────────────────────────────────────────────

def test_flag_returns_report_count() -> None:
    public = _FakePublicRepo()
    public.flag_result = {"report_count": 5, "status": "hidden"}
    _override(public_repo=public)
    try:
        with TestClient(app) as client:
            res = client.post("/comments/c2/flag")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 200
    assert res.json() == {"comment_id": "c2", "report_count": 5, "status": "hidden"}


def test_flag_404_when_not_visible() -> None:
    public = _FakePublicRepo()
    public.visible_for_flag = None
    _override(public_repo=public)
    try:
        with TestClient(app) as client:
            res = client.post("/comments/missing/flag")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 404
