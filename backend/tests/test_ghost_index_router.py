"""Tests for routers/ghost_index.py — GET /public/ghost-index.

The index names employers in public. These cover the two failures that would
matter: publishing a page of zeroes when the snapshot has never been computed,
and losing the coverage statement that says what the index does not cover.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import ghost_index as ghost_router
from app.services import shared_cache
from app.services.background import debounce


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeClient:
    """Stubs the one RPC this router issues, and counts the calls."""

    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.calls = 0

    def rpc(self, name: str, _params: dict[str, Any]) -> "_FakeClient":
        assert name == "ghost_index_payload"
        return self

    def execute(self) -> _Result:
        self.calls += 1
        return _Result(self.payload)


def _payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "method": "ghost-index-v2",
        "computed_at": "2026-09-05T08:24:59.897503+00:00",
        "overall": {
            "period": "all",
            "feed_overlap": 2257,
            "still_advertised": 1377,
            "still_advertised_rate": 0.610,
            "avg_days_still_advertised": 21.0,
            "ad_pulled_after_close": 837,
            "median_days_to_pull": 4.7,
            "listings_closed": 9476,
            "listings_live": 26576,
            "listings_inconclusive": 36481,
        },
        "months": [],
        "companies": [{"scope_key": "Citibank", "feed_overlap": 87, "still_advertised_rate": 1.0}],
        "sectors": [],
        "coverage": {
            "min_cell": 20,
            "companies_published": 18,
            "companies_with_closures": 166,
            "companies_in_corpus": 295,
        },
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _reset_cache():
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()
    yield
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def _wire(monkeypatch: pytest.MonkeyPatch, client: _FakeClient) -> None:
    monkeypatch.setattr(ghost_router, "get_supabase", lambda: client)


def test_index_ships_every_rate_beside_its_denominator(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeClient(_payload())
    _wire(monkeypatch, fake)

    res = TestClient(app).get("/public/ghost-index")
    assert res.status_code == 200
    body = res.json()
    overall = body["overall"]
    # A rate alone is the number this index exists to argue against.
    assert overall["still_advertised_rate"] == 0.610
    assert overall["feed_overlap"] == 2257
    assert overall["still_advertised"] == 1377
    assert body["method"] == "ghost-index-v2"


def test_the_coverage_statement_travels_with_the_figures(monkeypatch: pytest.MonkeyPatch) -> None:
    """18 of 295 employers clear the minimum cell.

    Withheld rows are absent from `companies` by construction, so the only way a
    reader can tell "withheld" from "clean record" is this block.
    """
    fake = _FakeClient(_payload())
    _wire(monkeypatch, fake)

    coverage = TestClient(app).get("/public/ghost-index").json()["coverage"]
    assert coverage["companies_published"] == 18
    assert coverage["companies_in_corpus"] == 295
    assert coverage["min_cell"] == 20


def test_an_uncomputed_snapshot_is_absent_not_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    """A page of zeroes reads as "no employer does this" — the opposite claim.

    503 says we have no index to show, which is true and recoverable.
    """
    fake = _FakeClient({"overall": None, "companies": []})
    _wire(monkeypatch, fake)

    res = TestClient(app).get("/public/ghost-index")
    assert res.status_code == 503
    # The error boundary replaces every 5xx detail with a generic line
    # (security/error_handling.py) — deliberately, so nothing internal leaks.
    # The status code IS the contract the frontend branches on.
    assert res.json()["detail"]


def test_a_null_rpc_result_is_also_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, _FakeClient(None))
    assert TestClient(app).get("/public/ghost-index").status_code == 503


def test_the_index_is_read_once_per_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """The snapshot moves only when the refresh runs; a reader never pays for a
    rebuild it did not trigger."""
    fake = _FakeClient(_payload())
    _wire(monkeypatch, fake)

    client = TestClient(app)
    first = client.get("/public/ghost-index").json()
    after_first = fake.calls
    second = client.get("/public/ghost-index").json()

    assert fake.calls == after_first == 1
    assert first == second


def test_the_response_is_cacheable_by_the_cdn(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, _FakeClient(_payload()))
    res = TestClient(app).get("/public/ghost-index")
    assert res.headers.get("cache-control") == "public, max-age=300, stale-while-revalidate=86400"
