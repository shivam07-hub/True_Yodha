"""Spec #66 L5: the landing's reviewer chapter reads the live Human Check slots.

One public, shared-cached read: how many of the reviewer's five slots are free,
when a check bought now comes back, and the price of the pack that carries it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import human_check, shared_cache
from app.services.background import debounce


class _Store:
    def __init__(self, due: list[datetime]) -> None:
        self.due = due
        self.calls = 0

    def open_due_ats(self) -> list[datetime]:
        self.calls += 1
        return self.due


@pytest.fixture(autouse=True)
def _reset_cache():
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()
    yield
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def _serve(monkeypatch: pytest.MonkeyPatch, store: _Store) -> None:
    monkeypatch.setattr(human_check, "SupabaseHumanCheckStore", lambda: store)


def test_open_slots_and_ready_by(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(timezone.utc)
    _serve(monkeypatch, _Store([now + timedelta(hours=2), now + timedelta(hours=9)]))

    res = TestClient(app).get("/public/human-check")
    assert res.status_code == 200
    assert res.headers.get("cache-control") == "public, max-age=60"
    body = res.json()
    assert body["capacity"] == 5
    assert body["slots_open"] == 3
    assert body["check_hours"] == 24
    assert body["price_paise"] == 19900
    ready_by = datetime.fromisoformat(body["ready_by"])
    assert abs(ready_by - (now + timedelta(hours=24))) < timedelta(minutes=1)


def test_all_five_taken_says_when_the_next_comes_back(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(timezone.utc)
    due = [now + timedelta(hours=h) for h in (3, 5, 8, 12, 20)]
    _serve(monkeypatch, _Store(due))

    body = TestClient(app).get("/public/human-check").json()
    assert body["slots_open"] == 0
    assert datetime.fromisoformat(body["ready_by"]) == due[0] + timedelta(hours=24)


def test_cached_one_read_for_many_visitors(monkeypatch: pytest.MonkeyPatch) -> None:
    store = _Store([])
    _serve(monkeypatch, store)

    client = TestClient(app)
    first = client.get("/public/human-check").json()
    second = client.get("/public/human-check").json()
    assert first == second
    assert first["slots_open"] == 5
    assert store.calls == 1
