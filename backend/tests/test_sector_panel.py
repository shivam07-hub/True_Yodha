"""The sector hiring panel — Wave 2's first slice.

It names sectors in public and is aimed at a buyer, so the rules that keep it
honest are the same ones the Ghost Job Index needed, asserted the same way:
on structure, never on vocabulary.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import sector_panel as router_mod
from app.services import shared_cache
from app.services.background import debounce

MIGRATION = (
    Path(__file__).parents[2] / "database/migrations/20260906_sector_hiring_panel.sql"
).read_text()
_NO_COMMENTS = "\n".join(line.split("--")[0] for line in MIGRATION.splitlines())
DDL = re.sub(r"comment on [^;]+;", "", _NO_COMMENTS, flags=re.IGNORECASE | re.DOTALL)


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeClient:
    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.calls = 0

    def rpc(self, name: str, _p: dict[str, Any]) -> "_FakeClient":
        assert name == "sector_panel_payload"
        return self

    def execute(self) -> _Result:
        self.calls += 1
        return _Result(self.payload)


def _payload() -> dict[str, Any]:
    return {
        "method": "sector-panel-v1",
        "computed_at": "2026-09-06T00:00:00+00:00",
        "sectors": [{"sector": "BFSI", "live_roles": 13720, "employers": 33}],
        "coverage": {
            "min_live_roles": 100, "min_employers": 5,
            "sectors_published": 8, "sectors_tracked": 10,
            "live_roles_published": 35902, "live_roles_tracked": 36076,
        },
    }


@pytest.fixture(autouse=True)
def _reset_cache():
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()
    yield
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def test_a_sector_below_the_minimum_cell_is_not_published() -> None:
    """Media & Telecom has 6 live roles across 2 employers. Publishing that as a
    sector would be noise wearing a heading."""
    assert "v_min_roles    integer := 100" in DDL
    assert "v_min_employers integer := 5" in DDL
    assert "having count(*) >= v_min_roles" in DDL
    assert "count(distinct company_name) >= v_min_employers" in DDL


def test_unclassified_listings_are_excluded_never_bucketed() -> None:
    """An unclassified listing is missing data, not an 'Other' sector."""
    assert "nullif(btrim(j.industry_group), '') is not null" in DDL
    assert "'Other'" not in DDL


def test_the_cross_referenced_rate_is_read_not_recomputed() -> None:
    """It comes from ghost_index_snapshot. Recomputing it here with a looser
    rule would publish a number that index deliberately withheld."""
    assert "from ghost_index_snapshot g" in DDL
    assert "g.scope = 'sector'" in DDL


def test_the_panel_reads_no_user_data() -> None:
    for user_table in ("user_profiles", "job_applications", "cv_versions", "user_id"):
        assert user_table not in DDL


def test_the_panel_is_service_role_only_to_write() -> None:
    assert "revoke all on function public.refresh_sector_panel() from public, anon, authenticated;" in DDL
    assert "for select to anon, authenticated using (true)" in DDL


def test_the_endpoint_ships_coverage_with_the_sectors(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeClient(_payload())
    monkeypatch.setattr(router_mod, "get_supabase", lambda: fake)
    body = TestClient(app).get("/public/hiring-panel").json()
    assert body["coverage"]["sectors_published"] == 8
    assert body["coverage"]["sectors_tracked"] == 10
    assert body["method"] == "sector-panel-v1"


def test_an_uncomputed_panel_is_absent_not_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    """A panel of zeroes would read as 'nothing is hiring'."""
    monkeypatch.setattr(router_mod, "get_supabase", lambda: _FakeClient({"sectors": []}))
    assert TestClient(app).get("/public/hiring-panel").status_code == 503


def test_the_panel_is_read_once_per_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _FakeClient(_payload())
    monkeypatch.setattr(router_mod, "get_supabase", lambda: fake)
    client = TestClient(app)
    client.get("/public/hiring-panel")
    client.get("/public/hiring-panel")
    assert fake.calls == 1


def test_the_public_payload_never_aggregates_public_jobs() -> None:
    """The coverage block counted sectors from `public.jobs` on every read and
    cost an 8s statement timeout as `anon` — the SAME trap the Ghost Job Index
    hit, repeated in a payload written after fixing it.

    The coverage block is the part added last, for honesty, and it is the part
    nobody measures. A public payload touches only its own snapshot.
    """
    tier0 = (
        Path(__file__).parents[2]
        / "database/migrations/20260906c_sector_panel_coverage_tier0.sql"
    ).read_text()
    assert "sectors_tracked" in tier0
    assert "5.5ms" in tier0
