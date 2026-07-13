"""Backlog #36 Slice 2 — the in-app notification inbox: router, repo debounce,
and the sweep's compute-then-notify write path."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories.notifications import NotificationsRepository, get_notifications_repository
from app.services.matching import match_run


# ── router ──────────────────────────────────────────────────────────────────


class _FakeNotifRepo:
    def __init__(self, *, items: list[dict[str, Any]] | None = None, unread: int = 0) -> None:
        self._items = items or []
        self._unread = unread
        self.marked: list[Any] = []

    def list_for_user(self, _user_id: str, *, limit: int = 30) -> list[dict[str, Any]]:
        return self._items

    def unread_count(self, _user_id: str) -> int:
        return self._unread

    def mark_read(self, _user_id: str, ids: list[int] | None = None) -> None:
        self.marked.append(ids)


def _override(repo: _FakeNotifRepo) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", email="u@x.com", token="t")
    app.dependency_overrides[get_notifications_repository] = lambda: repo


def test_unread_count_endpoint() -> None:
    repo = _FakeNotifRepo(unread=4)
    _override(repo)
    try:
        with TestClient(app) as client:
            r = client.get("/notifications/unread-count")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    assert r.json() == {"count": 4}


def test_list_returns_items_and_derived_unread() -> None:
    repo = _FakeNotifRepo(items=[
        {"id": 2, "kind": "fresh_matches", "title": "3 fresh matches", "body": "Paytm · Growth Manager",
         "job_id": "j1", "match_count": 3, "read_at": None, "created_at": "2026-07-10T10:00:00+00:00"},
        {"id": 1, "kind": "fresh_matches", "title": "1 fresh match", "body": "Adidas · CRM",
         "job_id": "j2", "match_count": 1, "read_at": "2026-07-09T10:00:00+00:00", "created_at": "2026-07-09T10:00:00+00:00"},
    ])
    _override(repo)
    try:
        with TestClient(app) as client:
            r = client.get("/notifications")
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 200
    body = r.json()
    assert body["unread_count"] == 1  # only the unread (read_at None) one
    assert body["items"][0]["job_id"] == "j1"


def test_mark_read_all_when_no_ids() -> None:
    repo = _FakeNotifRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            r = client.post("/notifications/read", json={})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 204
    assert repo.marked == [None]  # None = mark all


def test_mark_read_specific_ids() -> None:
    repo = _FakeNotifRepo()
    _override(repo)
    try:
        with TestClient(app) as client:
            r = client.post("/notifications/read", json={"ids": [1, 2]})
    finally:
        app.dependency_overrides.clear()
    assert r.status_code == 204
    assert repo.marked == [[1, 2]]


# ── repo debounce (merge vs insert) ─────────────────────────────────────────


class _Capture:
    def __init__(self) -> None:
        self.inserted: list[dict[str, Any]] = []
        self.updated: list[tuple[int, dict[str, Any]]] = []


class _FreshQuery:
    """Fake user_notifications query chain — returns `existing` from the debounce
    select, records insert/update on `cap`."""

    def __init__(self, existing: list[dict[str, Any]], cap: _Capture) -> None:
        self._existing = existing
        self._cap = cap
        self._pending_update: dict[str, Any] | None = None

    def select(self, _cols: str) -> "_FreshQuery":
        return self

    def eq(self, *_a: Any) -> "_FreshQuery":
        return self

    def is_(self, *_a: Any) -> "_FreshQuery":
        return self

    def gte(self, *_a: Any) -> "_FreshQuery":
        return self

    def order(self, *_a: Any, **_k: Any) -> "_FreshQuery":
        return self

    def limit(self, *_a: Any) -> "_FreshQuery":
        return self

    def insert(self, row: dict[str, Any]) -> "_FreshQuery":
        self._cap.inserted.append(row)
        return self

    def update(self, patch: dict[str, Any]) -> "_FreshQuery":
        self._pending_update = patch
        return self

    def execute(self) -> Any:
        if self._pending_update is not None:
            self._cap.updated.append((self._pending_update.get("_id"), self._pending_update))
            self._pending_update = None
            return type("R", (), {"data": []})()
        return type("R", (), {"data": self._existing})()


class _FreshDB:
    def __init__(self, existing: list[dict[str, Any]], cap: _Capture) -> None:
        self._existing = existing
        self._cap = cap
        self._eq_id: int | None = None

    def table(self, _name: str) -> _FreshQuery:
        return _FreshQuery(self._existing, self._cap)


def test_record_fresh_matches_inserts_when_none_recent() -> None:
    cap = _Capture()
    db = _FreshDB(existing=[], cap=cap)
    NotificationsRepository(db, db).record_fresh_matches(  # type: ignore[arg-type]
        "u1", job_id="j1", title="2 fresh matches", body="Paytm · PM", count=2
    )
    assert len(cap.inserted) == 1
    assert cap.inserted[0]["kind"] == "fresh_matches"
    assert cap.inserted[0]["match_count"] == 2
    assert cap.inserted[0]["job_id"] == "j1"
    assert not cap.updated


def test_record_fresh_matches_merges_into_unread_within_window() -> None:
    cap = _Capture()
    db = _FreshDB(existing=[{"id": 7, "match_count": 3}], cap=cap)
    NotificationsRepository(db, db).record_fresh_matches(  # type: ignore[arg-type]
        "u1", job_id="j9", title="2 fresh matches", body="Adidas · CRM", count=2
    )
    assert not cap.inserted  # merged, not a second ping
    assert len(cap.updated) == 1
    _, patch = cap.updated[0]
    assert patch["match_count"] == 5  # 3 + 2
    assert patch["title"] == "5 fresh matches"  # recomputed on merge
    assert patch["job_id"] == "j9"  # top match refreshed


# ── sweep write path: compute-then-notify ───────────────────────────────────


class _FakeSweepRepo2:
    client = object()  # match_run._notify_fresh_matches reads repo.client (admin) for notifs

    def __init__(self, before_ids: list[str], after_stack: list[dict[str, Any]]) -> None:
        self._before = before_ids
        self._after = after_stack

    def get_existing_match_job_ids(self, _user_id: str) -> list[str]:
        return self._before

    def get_user_match_stack(self, _user_id: str) -> list[dict[str, Any]]:
        return self._after


def test_notify_fresh_matches_writes_only_new_and_picks_top(monkeypatch: Any) -> None:
    repo = _FakeSweepRepo2(
        before_ids=["old1"],
        after_stack=[
            {"job_id": "old1", "overall_score": 9.0, "jobs": {"company_name": "X", "job_title": "Old"}},
            {"job_id": "new1", "overall_score": 4.0, "jobs": {"company_name": "Adidas", "job_title": "CRM"}},
            {"job_id": "new2", "overall_score": 7.5, "jobs": {"company_name": "Paytm", "job_title": "Growth Manager"}},
        ],
    )
    captured: dict[str, Any] = {}

    def _fake_record(self: Any, user_id: str, **kwargs: Any) -> None:
        captured.update(user_id=user_id, **kwargs)

    monkeypatch.setattr(match_run.NotificationsRepository, "record_fresh_matches", _fake_record)

    match_run._notify_fresh_matches(repo, "u1", {"old1"})  # type: ignore[arg-type]

    assert captured["count"] == 2  # new1 + new2, old1 excluded
    assert captured["job_id"] == "new2"  # highest overall_score among the NEW ones
    assert captured["body"] == "Paytm · Growth Manager"
    assert captured["title"] == "2 fresh matches"


def test_notify_fresh_matches_noop_when_nothing_new(monkeypatch: Any) -> None:
    repo = _FakeSweepRepo2(
        before_ids=["a", "b"],
        after_stack=[{"job_id": "a", "jobs": {}}, {"job_id": "b", "jobs": {}}],
    )
    called = {"n": 0}

    def _fake_record(self: Any, *_a: Any, **_k: Any) -> None:
        called["n"] += 1

    monkeypatch.setattr(match_run.NotificationsRepository, "record_fresh_matches", _fake_record)

    match_run._notify_fresh_matches(repo, "u1", {"a", "b"})  # type: ignore[arg-type]

    assert called["n"] == 0  # never notify on speculation
