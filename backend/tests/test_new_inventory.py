"""New-inventory model (2026-07-28): a scrape landing announces itself at the
user's next visit; the user pulls the match. Covers the announcement projection
(debounce + one live row), the resolve-on-run, and the price waiver."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.repositories.notifications import (
    NEW_INVENTORY_DEBOUNCE_HOURS,
    NotificationsRepository,
)
from app.services import new_inventory


class _Capture:
    def __init__(self) -> None:
        self.inserted: list[dict[str, Any]] = []
        self.updated: list[dict[str, Any]] = []


class _RPC:
    def __init__(self, db: "_DB") -> None:
        self._db = db

    def execute(self) -> Any:
        if self._db.count_error is not None:
            raise self._db.count_error
        return type("R", (), {"data": self._db.live_count})()


class _Query:
    """Minimal PostgREST chain: select→…→execute, insert, update."""

    def __init__(self, existing: list[dict[str, Any]], cap: _Capture) -> None:
        self._existing = existing
        self._cap = cap
        self._update: dict[str, Any] | None = None

    def select(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def eq(self, *_a: Any) -> "_Query":
        return self

    def is_(self, *_a: Any) -> "_Query":
        return self

    def order(self, *_a: Any, **_k: Any) -> "_Query":
        return self

    def limit(self, *_a: Any) -> "_Query":
        return self

    def insert(self, row: dict[str, Any]) -> "_Query":
        self._cap.inserted.append(row)
        return self

    def update(self, patch: dict[str, Any]) -> "_Query":
        self._update = patch
        return self

    def execute(self) -> Any:
        if self._update is not None:
            self._cap.updated.append(self._update)
            self._update = None
            return type("R", (), {"data": []})()
        return type("R", (), {"data": self._existing})()


class _DB:
    def __init__(
        self,
        existing: list[dict[str, Any]],
        cap: _Capture,
        *,
        live_count: int = 0,
        count_error: Exception | None = None,
    ) -> None:
        self._existing = existing
        self._cap = cap
        self.live_count = live_count
        self.count_error = count_error
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def table(self, _name: str) -> _Query:
        return _Query(self._existing, self._cap)

    def rpc(self, name: str, params: dict[str, Any]) -> _RPC:
        self.rpc_calls.append((name, params))
        return _RPC(self)


def _repo(existing: list[dict[str, Any]], cap: _Capture) -> NotificationsRepository:
    db = _DB(existing, cap)
    return NotificationsRepository(db, db)  # type: ignore[arg-type]


# ── announcement ────────────────────────────────────────────────────────────


def test_announces_when_nothing_pending() -> None:
    cap = _Capture()
    assert _repo([], cap).record_new_inventory("u1", count=12_431) is True
    row = cap.inserted[0]
    assert row["kind"] == "new_jobs"
    assert row["match_count"] == 12_431
    assert "12,431" in row["title"]          # readable at a glance, not "12431"
    assert row["action_url"] == "/market?search=1"


def test_zero_new_jobs_never_announces() -> None:
    cap = _Capture()
    assert _repo([], cap).record_new_inventory("u1", count=0) is False
    assert not cap.inserted and not cap.updated


def test_growing_inventory_updates_the_live_row_instead_of_stacking() -> None:
    cap = _Capture()
    existing = [{"id": 5, "read_at": None, "match_count": 900}]
    assert _repo(existing, cap).record_new_inventory("u1", count=1_400) is True
    assert not cap.inserted                   # one live announcement, never a pile
    assert cap.updated[0]["match_count"] == 1_400


def test_unchanged_count_is_not_rewritten() -> None:
    cap = _Capture()
    existing = [{"id": 5, "read_at": None, "match_count": 900}]
    assert _repo(existing, cap).record_new_inventory("u1", count=900) is False
    assert not cap.inserted and not cap.updated


def test_seen_announcement_is_not_re_raised_inside_the_debounce() -> None:
    cap = _Capture()
    seen = datetime.now(timezone.utc) - timedelta(hours=1)
    existing = [{"id": 5, "read_at": seen.isoformat(), "match_count": 900}]
    assert _repo(existing, cap).record_new_inventory("u1", count=1_000) is False
    assert not cap.inserted


def test_announcement_returns_after_the_debounce_window() -> None:
    cap = _Capture()
    seen = datetime.now(timezone.utc) - timedelta(hours=NEW_INVENTORY_DEBOUNCE_HOURS + 1)
    existing = [{"id": 5, "read_at": seen.isoformat(), "match_count": 900}]
    assert _repo(existing, cap).record_new_inventory("u1", count=1_000) is True
    assert cap.inserted[0]["match_count"] == 1_000


def test_inbox_rederives_unread_new_inventory_before_returning_it() -> None:
    cap = _Capture()
    writer_cap = _Capture()
    existing = [{
        "id": 5,
        "kind": "new_jobs",
        "read_at": None,
        "match_count": 900,
        "title": "900 new roles to search",
        "body": "old",
    }]
    db = _DB(existing, cap, live_count=1_400)
    writer_db = _DB([], writer_cap)

    rows = NotificationsRepository(db, writer_db).list_for_user("u1")  # type: ignore[arg-type]

    assert rows[0]["match_count"] == 1_400
    assert rows[0]["title"] == "1,400 new roles to search"
    assert cap.updated == []
    assert writer_cap.updated[0]["match_count"] == 1_400
    assert db.rpc_calls == [("count_new_jobs_for_user", {"p_user_id": "u1"})]


def test_inbox_resolves_new_inventory_when_live_count_is_zero() -> None:
    cap = _Capture()
    existing = [{
        "id": 5,
        "kind": "new_jobs",
        "read_at": None,
        "match_count": 900,
        "title": "900 new roles to search",
    }]
    db = _DB(existing, cap, live_count=0)

    rows = NotificationsRepository(db, db).list_for_user("u1")  # type: ignore[arg-type]

    assert rows == []
    assert cap.updated[0]["read_at"]


def test_inbox_hides_persisted_count_when_live_rederivation_fails(caplog: Any) -> None:
    cap = _Capture()
    existing = [{
        "id": 5,
        "kind": "new_jobs",
        "read_at": None,
        "match_count": 900,
        "title": "900 new roles to search",
    }]
    db = _DB(existing, cap, count_error=RuntimeError("count unavailable"))

    rows = NotificationsRepository(db, db).list_for_user("u1")  # type: ignore[arg-type]

    assert rows == []
    assert cap.updated == []
    assert "new_inventory.reconcile_failed" in caplog.text


# ── count + failure posture ─────────────────────────────────────────────────


class _RepoNeverMatched:
    def count_new_jobs_for_user(self, _user_id: str) -> int:
        return 0


class _RepoBroken:
    def count_new_jobs_for_user(self, _user_id: str) -> int:
        raise RuntimeError("postgrest is having a day")


def test_count_is_zero_for_a_never_matched_user() -> None:
    assert new_inventory.count_for_user(_RepoNeverMatched(), "u1") == 0


def test_count_failure_is_unknown_not_zero() -> None:
    """It may never take the page down — but "we could not tell" is not "zero".

    This asserted `== 0` until 2026-08-22, and 0 is the value that prices a run
    at `MATCH_RUN_COST`. The query read-timed-out four times in one hour of prod
    logs on 2026-08-21, and every one of those would have billed a user 100
    coins because our database was slow.

    The original intent still holds: `None` is falsy at every DISPLAY site, so a
    broken count still reads as "nothing new" and never as a prompt. What
    changed is that the WALLET no longer reads it as a caught-up user.
    """
    assert new_inventory.count_for_user(_RepoBroken(), "u1") is None


def test_the_waiver_is_one_rule() -> None:
    """Three surfaces price a run — `/preflight/price`, the legacy
    `/jobs/refresh/preflight`, and `JobRefresh.start`, which is the one that
    debits. When they drift, a user is quoted one number and billed another."""
    assert new_inventory.waives_charge(None) is True, "unknown waives"
    assert new_inventory.waives_charge(7) is True, "new inventory waives"
    assert new_inventory.waives_charge(0) is False, "caught up — a real second search"


# ── the announcement is spent by the run it asked for ───────────────────────


def test_resolve_marks_the_live_announcement_read(monkeypatch: Any) -> None:
    cap = _Capture()
    db = _DB([], cap)
    monkeypatch.setattr(new_inventory, "get_supabase_admin", lambda: db)
    new_inventory.resolve_for_user("u1")
    assert cap.updated and cap.updated[0]["read_at"]
