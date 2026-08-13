"""Skill-demand panel: read shape, degradation, and the refresh trigger gate.

The guards themselves (liveness / spread / dominance / taxonomy) live in SQL and
are asserted by the migration's own invariants; what is testable here is that the
read layer never invents a number, never falls back to a live scan, and that the
verifier only pays for a refresh when listings actually left the set.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from postgrest.exceptions import APIError

from app.repositories.skill_demand import SkillDemandRepository


def _fresh_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


class _Query:
    """Minimal postgrest chain stub — every builder call returns self."""

    def __init__(self, rows, raises=False):
        self._rows = rows
        self._raises = raises

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def execute(self):
        if self._raises:
            raise APIError({"message": "relation does not exist"})
        return MagicMock(data=self._rows)


def _repo(rows, raises=False):
    db = MagicMock()
    db.table.return_value = _Query(rows, raises=raises)
    return SkillDemandRepository(db)


def test_demand_maps_rows_in_rank_order():
    repo = _repo([
        {"display_name": "CI/CD", "roles": 284, "companies": 54,
         "rank": 1, "computed_at": _fresh_timestamp()},
        {"display_name": "Scalability", "roles": 241, "companies": 59,
         "rank": 2, "computed_at": _fresh_timestamp()},
    ])
    out = repo.get_demand("Bengaluru", "30d")
    assert [s.skill for s in out.skills] == ["CI/CD", "Scalability"]
    assert out.skills[0].roles == 284
    assert out.skills[0].companies == 54
    assert out.city == "Bengaluru"
    assert out.window == "30d"


def test_demand_always_carries_company_count():
    """`roles` without `companies` is the number that misled users before. The
    field is non-optional, so a row missing it reads 0, never absent."""
    repo = _repo([{
        "display_name": "Supply Chain",
        "roles": 29,
        "rank": 1,
        "computed_at": _fresh_timestamp(),
    }])
    out = repo.get_demand("Gurugram", "all")
    assert out.skills[0].companies == 0


def test_unknown_city_is_empty_not_an_error():
    out = _repo([]).get_demand("Atlantis", "30d")
    assert out.skills == []
    assert out.computed_at is None


def test_read_failure_degrades_to_empty(caplog):
    """A missing/mid-refresh snapshot costs the widget, not the page — but it is
    logged; a permanently blank panel nobody is told about is the original bug."""
    out = _repo([], raises=True).get_demand("Bengaluru", "30d")
    assert out.skills == []
    assert "skill_demand.read_failed" in caplog.text


def test_overdue_demand_is_suppressed_instead_of_rendered_as_current(caplog):
    overdue = (datetime.now(timezone.utc) - timedelta(hours=49)).isoformat()
    out = _repo([
        {"display_name": "Communication", "roles": 117, "companies": 30,
         "rank": 1, "computed_at": overdue},
    ]).get_demand("Gurugram", "30d")

    assert out.skills == []
    assert out.computed_at == datetime.fromisoformat(overdue)
    assert "skill_demand.snapshot_stale" in caplog.text


def test_cities_are_ordered_by_live_roles():
    repo = _repo([
        {"location_city": "Bengaluru", "live_roles": 13002, "computed_at": _fresh_timestamp()},
        {"location_city": "Kochi", "live_roles": 212, "computed_at": _fresh_timestamp()},
    ])
    out = repo.list_cities()
    assert [c.city for c in out.cities] == ["Bengaluru", "Kochi"]
    assert out.computed_at is not None


def test_refresh_returns_counts():
    db = MagicMock()
    db.rpc.return_value.execute.return_value = MagicMock(
        data=[{"cities": 12, "rows_written": 262}]
    )
    assert SkillDemandRepository(db).refresh() == {"cities": 12, "rows_written": 262}
    db.rpc.assert_called_once_with("refresh_skill_demand_snapshot", {})


@pytest.mark.parametrize(
    "counts,retired,expected",
    [
        ({"closed": 3}, 0, True),        # listings left the set
        ({"seen_live": 200}, 0, False),  # membership unchanged — don't pay 9s
        ({"error": 50}, 0, False),
        ({}, 7, True),                   # retirements also shrink the set
    ],
)
def test_verifier_refresh_gate(counts, retired, expected, monkeypatch):
    from app.workers import job_listing_verifier as verifier

    called = {"n": 0}

    class _Repo:
        def __init__(self, *_a, **_k):
            pass

        def refresh(self):
            called["n"] += 1
            return {"cities": 1, "rows_written": 1}

    monkeypatch.setattr("app.repositories.skill_demand.SkillDemandRepository", _Repo)
    monkeypatch.setattr(verifier, "get_supabase_admin", lambda: MagicMock())
    verifier._refresh_skill_demand_if_changed(counts, retired)
    assert (called["n"] == 1) is expected


def test_verifier_refresh_never_raises_into_the_sweep(monkeypatch):
    """The sweep's verdicts are already persisted by this point; a panel refresh
    blowing up must not lose them."""
    from app.workers import job_listing_verifier as verifier

    class _Boom:
        def __init__(self, *_a, **_k):
            pass

        def refresh(self):
            raise RuntimeError("db down")

    monkeypatch.setattr("app.repositories.skill_demand.SkillDemandRepository", _Boom)
    monkeypatch.setattr(verifier, "get_supabase_admin", lambda: MagicMock())
    verifier._refresh_skill_demand_if_changed({"closed": 1}, 0)  # must not raise
