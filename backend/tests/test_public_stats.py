"""Tests for routers/public.py — GET /public/stats.

Covers:
- happy path returns analytics totals + seeker count + static skills constant
- second call within the TTL is served from cache (no second repo/DB hit)
- zero/None analytics values coerce to ints (never null in the payload)
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import public as public_router
from app.services import shared_cache
from app.services.background import debounce


class _FakeRepo:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.calls = 0

    def compile_market_analytics(self) -> dict[str, Any]:
        self.calls += 1
        return self.payload


class _FakeCountResult:
    def __init__(self, count: int | None) -> None:
        self.count = count


class _FakeAdmin:
    """Chainable count stub.

    Must model `.eq()`/`.gte()` as well as select/limit: the provenance counts
    filter, and a double that silently lacks the method sends `_count`'s
    except-branch a zero — which looks exactly like a real count of zero.
    """

    def __init__(self, count: int | None) -> None:
        self._count = count
        self.calls = 0

    def table(self, _name: str) -> "_FakeAdmin":
        return self

    def select(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def limit(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def eq(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def gte(self, *_a: Any, **_k: Any) -> "_FakeAdmin":
        return self

    def execute(self) -> _FakeCountResult:
        self.calls += 1
        return _FakeCountResult(self._count)


@pytest.fixture(autouse=True)
def _reset_cache():
    # /public/stats now caches through shared_cache (ARCHITECTURE_READ_PATH.md
    # S3), not a router-local dict — reset its (test-env) local-dict fallback
    # and single-flight claims so one test's cached value can't leak into the
    # next.
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()
    yield
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def _wire(monkeypatch: pytest.MonkeyPatch, repo: _FakeRepo, admin: _FakeAdmin) -> None:
    monkeypatch.setattr(public_router, "get_public_jobs_repository", lambda: repo)
    monkeypatch.setattr(public_router, "get_supabase_admin", lambda: admin)


def test_stats_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": 4321, "total_companies": 157})
    admin = _FakeAdmin(count=1043)
    _wire(monkeypatch, repo, admin)

    res = TestClient(app).get("/public/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["jobs_tracked"] == 4321
    assert body["companies_monitored"] == 157
    assert body["skills_mapped"] == public_router.SKILLS_MAPPED
    assert body["seekers"] == 1043
    assert body["as_of"]
    # Provenance travels with the counters — the landing strip and the authed
    # rail card read the same numbers from the same build.
    prov = body["provenance"]
    assert prov["total"] == 1043
    assert prov["community"] == 1043
    assert prov["agent"] == 0  # derived: total - community, floored at 0
    assert prov["verified_live"] == 1043
    assert prov["verified_window_days"] == 7


def test_stats_cached_within_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": 100, "total_companies": 10})
    admin = _FakeAdmin(count=5)
    _wire(monkeypatch, repo, admin)

    client = TestClient(app)
    first = client.get("/public/stats").json()
    after_first = admin.calls
    second = client.get("/public/stats").json()

    assert first == second
    assert repo.calls == 1
    # The cache is the assertion, not the call count: a served-from-cache
    # response must do NO further DB work, however many reads one cold build
    # costs (seekers + the provenance counts).
    assert after_first > 0
    assert admin.calls == after_first


def test_stats_coerces_missing_values(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = _FakeRepo({"total_jobs": None, "total_companies": None})
    admin = _FakeAdmin(count=None)
    _wire(monkeypatch, repo, admin)

    body = TestClient(app).get("/public/stats").json()
    assert body["jobs_tracked"] == 0
    assert body["companies_monitored"] == 0
    assert body["seekers"] == 0
