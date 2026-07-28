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
    def __init__(self, existing: list[dict[str, Any]], cap: _Capture) -> None:
        self._existing = existing
        self._cap = cap

    def table(self, _name: str) -> _Query:
        return _Query(self._existing, self._cap)


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


# ── count + failure posture ─────────────────────────────────────────────────


class _RepoNeverMatched:
    def count_new_jobs_for_user(self, _user_id: str) -> int:
        return 0


class _RepoBroken:
    def count_new_jobs_for_user(self, _user_id: str) -> int:
        raise RuntimeError("postgrest is having a day")


def test_count_is_zero_for_a_never_matched_user() -> None:
    assert new_inventory.count_for_user(_RepoNeverMatched(), "u1") == 0


def test_count_failure_degrades_to_zero_not_a_500() -> None:
    """This number is read on the feed's critical path — it may never take the
    page down, and a broken count must read as "nothing new", never as a prompt."""
    assert new_inventory.count_for_user(_RepoBroken(), "u1") == 0


# ── the announcement is spent by the run it asked for ───────────────────────


def test_resolve_marks_the_live_announcement_read(monkeypatch: Any) -> None:
    cap = _Capture()
    db = _DB([], cap)
    monkeypatch.setattr(new_inventory, "get_supabase_admin", lambda: db)
    new_inventory.resolve_for_user("u1")
    assert cap.updated and cap.updated[0]["read_at"]
