"""Backlog #36 Slice 2 — the in-app notification inbox: router, repo debounce,
and the sweep's compute-then-notify write path."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.repositories import cv_upload_jobs
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


def test_unread_count_uses_exact_count_without_loading_all_ids() -> None:
    class _Result:
        count = 47
        data = [{"id": 1}]

    class _Query:
        def __init__(self) -> None:
            self.count_mode: str | None = None
            self.limit_value: int | None = None

        def select(self, _columns: str, *, count: str | None = None) -> "_Query":
            self.count_mode = count
            return self

        def eq(self, *_args: Any) -> "_Query":
            return self

        def is_(self, *_args: Any) -> "_Query":
            return self

        def limit(self, value: int) -> "_Query":
            self.limit_value = value
            return self

        def execute(self) -> _Result:
            return _Result()

    query = _Query()

    class _DB:
        def table(self, _name: str) -> _Query:
            return query

    repo = NotificationsRepository(_DB())  # type: ignore[arg-type]
    assert repo.unread_count("u1") == 47
    assert query.count_mode == "exact"
    assert query.limit_value == 1


def test_list_returns_items_and_derived_unread() -> None:
    repo = _FakeNotifRepo(items=[
        {"id": 2, "kind": "cv_analysis", "title": "Your Myro Score is ready", "body": "6 skills mapped · Myro Score 42",
         "job_id": None, "source_id": "upload-1", "action_url": "/cv", "state": "ready",
         "match_count": 1, "read_at": None, "created_at": "2026-07-10T10:00:00+00:00"},
        {"id": 1, "kind": "fresh_matches", "title": "1 fresh match", "body": "Adidas · CRM",
         "job_id": "j2", "source_id": None, "action_url": None, "state": None,
         "match_count": 1, "read_at": "2026-07-09T10:00:00+00:00", "created_at": "2026-07-09T10:00:00+00:00"},
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
    assert body["items"][0]["source_id"] == "upload-1"
    assert body["items"][0]["action_url"] == "/cv"
    assert body["items"][0]["state"] == "ready"


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


# ── CV-analysis lifecycle projection ────────────────────────────────────────


class _LifecycleQuery:
    def __init__(self, cap: _Capture) -> None:
        self._cap = cap
        self._pending_update: dict[str, Any] | None = None

    def upsert(self, row: dict[str, Any], **_kwargs: Any) -> "_LifecycleQuery":
        self._cap.inserted.append(row)
        return self

    def update(self, patch: dict[str, Any]) -> "_LifecycleQuery":
        self._pending_update = patch
        return self

    def eq(self, *_args: Any) -> "_LifecycleQuery":
        return self

    def execute(self) -> Any:
        if self._pending_update is not None:
            self._cap.updated.append((0, self._pending_update))
        return type("R", (), {"data": []})()


class _LifecycleDB:
    def __init__(self, cap: _Capture) -> None:
        self._cap = cap

    def table(self, _name: str) -> _LifecycleQuery:
        return _LifecycleQuery(self._cap)


def test_cv_analysis_notification_projects_processing_and_ready_states() -> None:
    cap = _Capture()
    db = _LifecycleDB(cap)
    repo = NotificationsRepository(db, db)  # type: ignore[arg-type]

    repo.record_cv_analysis_started("u1", source_id="upload-1")
    assert cap.inserted[0] | {"read_at": "timestamp"} == {
        "user_id": "u1",
        "kind": "cv_analysis",
        "source_id": "upload-1",
        "state": "processing",
        "title": "Analyzing your CV",
        "body": "Reading your CV",
        "action_url": "/cv",
        "match_count": 1,
        "read_at": "timestamp",
    }
    assert cap.inserted[0]["read_at"] is not None

    repo.update_cv_analysis_phase("upload-1", "structuring_cv")
    _, phase = cap.updated[-1]
    assert phase["state"] == "processing"
    assert phase["body"] == "Preparing your CV review"

    # A finished analysis always sends the user to confirm skills — scoring happens
    # there, so there is no score to announce here and no "Score is ready" variant.
    repo.record_cv_analysis_done("upload-1", skills_detected=6)
    _, done = cap.updated[-1]
    assert done["state"] == "ready"
    assert done["title"] == "Review the skills Myro found"
    assert done["body"] == "6 skills mapped · confirm them before scoring"
    assert done["action_url"] == "/onboarding/result"
    assert done["read_at"] is None


def test_cv_analysis_failure_becomes_unread_actionable_notification() -> None:
    cap = _Capture()
    db = _LifecycleDB(cap)
    repo = NotificationsRepository(db, db)  # type: ignore[arg-type]

    repo.record_cv_analysis_failed("upload-1", refunded=True)

    _, failed = cap.updated[-1]
    assert failed["state"] == "failed"
    assert failed["title"] == "CV analysis needs attention"
    assert failed["body"] == "Analysis stopped. Your Myro Coins were refunded."
    assert failed["read_at"] is None


class _JobQuery:
    def __init__(self) -> None:
        self._inserted = False
        self._updated = False

    def insert(self, _row: dict[str, Any]) -> "_JobQuery":
        self._inserted = True
        return self

    def update(self, _patch: dict[str, Any]) -> "_JobQuery":
        self._updated = True
        return self

    def eq(self, *_args: Any) -> "_JobQuery":
        return self

    def execute(self) -> Any:
        data = [{"id": "upload-1"}] if self._inserted or self._updated else []
        return type("R", (), {"data": data})()


class _JobDB:
    def table(self, _name: str) -> _JobQuery:
        return _JobQuery()


def test_cv_upload_job_projects_every_lifecycle_transition(monkeypatch: Any) -> None:
    calls: list[tuple[Any, ...]] = []

    class _Projection:
        def __init__(self, *_args: Any) -> None:
            pass

        def record_cv_analysis_started(self, user_id: str, *, source_id: str) -> None:
            calls.append(("started", user_id, source_id))

        def update_cv_analysis_phase(self, source_id: str, phase: str) -> None:
            calls.append(("phase", source_id, phase))

        def record_cv_analysis_done(self, source_id: str, **payload: Any) -> None:
            calls.append(("done", source_id, payload))

        def record_cv_analysis_failed(self, source_id: str, *, refunded: bool) -> None:
            calls.append(("failed", source_id, refunded))

    monkeypatch.setattr(cv_upload_jobs, "get_supabase_admin", lambda: _JobDB())
    monkeypatch.setattr(cv_upload_jobs, "NotificationsRepository", _Projection)

    job_id = cv_upload_jobs.create_processing_job(user_id="u1", content_hash="hash")
    cv_upload_jobs.record_notification_started(job_id, "u1")
    cv_upload_jobs.set_phase(job_id, "structuring_cv")
    cv_upload_jobs.mark_done(job_id, skills_detected=6)
    cv_upload_jobs.mark_failed(job_id, error_code="provider", error_detail="down", refunded=True)

    assert calls == [
        ("started", "u1", "upload-1"),
        ("phase", "upload-1", "structuring_cv"),
        ("done", "upload-1", {"skills_detected": 6}),
        ("failed", "upload-1", True),
    ]


def test_cv_upload_terminal_success_cannot_overwrite_a_swept_failure(monkeypatch: Any) -> None:
    filters: list[tuple[str, Any]] = []
    projected: list[str] = []

    class _Query:
        def update(self, _patch: dict[str, Any]) -> "_Query":
            return self

        def eq(self, column: str, value: Any) -> "_Query":
            filters.append((column, value))
            return self

        def select(self, _columns: str) -> "_Query":
            return self

        def execute(self) -> Any:
            # The row was already swept to failed, so status=processing matches nothing.
            return type("R", (), {"data": []})()

    class _DB:
        def table(self, _name: str) -> _Query:
            return _Query()

    class _Projection:
        def __init__(self, *_args: Any) -> None:
            pass

        def record_cv_analysis_done(self, *_args: Any, **_kwargs: Any) -> None:
            projected.append("done")

    monkeypatch.setattr(cv_upload_jobs, "get_supabase_admin", lambda: _DB())
    monkeypatch.setattr(cv_upload_jobs, "NotificationsRepository", _Projection)

    transitioned = cv_upload_jobs.mark_done("upload-1", skills_detected=6)

    assert transitioned is False
    assert ("status", "processing") in filters
    assert projected == []


def test_cv_upload_late_phase_cannot_reopen_a_terminal_notification(monkeypatch: Any) -> None:
    projected: list[str] = []

    class _Query:
        def update(self, _patch: dict[str, Any]) -> "_Query":
            return self

        def eq(self, *_args: Any) -> "_Query":
            return self

        def execute(self) -> Any:
            return type("R", (), {"data": []})()

    class _DB:
        def table(self, _name: str) -> _Query:
            return _Query()

    class _Projection:
        def __init__(self, *_args: Any) -> None:
            pass

        def update_cv_analysis_phase(self, *_args: Any) -> None:
            projected.append("phase")

    monkeypatch.setattr(cv_upload_jobs, "get_supabase_admin", lambda: _DB())
    monkeypatch.setattr(cv_upload_jobs, "NotificationsRepository", _Projection)

    cv_upload_jobs.set_phase("upload-1", "structuring_cv")

    assert projected == []


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
