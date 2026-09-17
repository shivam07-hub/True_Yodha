from datetime import datetime, timezone
from typing import Any

from postgrest.exceptions import APIError

from app.repositories.company_signals import CompanySignalsRepository
from app.repositories.jobs import JobsRepository
from app.services.company_pulse import SERIES_DAYS, compute_pulse, sort_key_for


class _Result:
    def __init__(self, data: Any) -> None:
        self.data = data


class _FakeSnapshot:
    """PostgREST chain for company_pulse_snapshot. Refuses any jobs table."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.in_keys: list[str] | None = None
        self.tables: list[str] = []

    def table(self, name: str) -> "_FakeSnapshot":
        self.tables.append(name)
        if name != "company_pulse_snapshot":
            raise AssertionError(f"Company Demand Pulse must not read {name}")
        return self

    def select(self, _columns: str) -> "_FakeSnapshot":
        return self

    def in_(self, column: str, values: list[str]) -> "_FakeSnapshot":
        assert column == "sort_key"
        self.in_keys = list(values)
        return self

    def execute(self) -> _Result:
        keys = set(self.in_keys or [])
        return _Result([row for row in self.rows if row["sort_key"] in keys])


def _inflow(*offsets: int) -> list[int]:
    hist = [0] * SERIES_DAYS
    for off in offsets:
        hist[off] += 1
    return hist


def test_jobs_repository_does_not_own_pulse() -> None:
    assert not hasattr(JobsRepository, "fetch_company_pulse")


def test_pulse_for_empty_input_short_circuits() -> None:
    repo = CompanySignalsRepository(_FakeSnapshot([]))  # type: ignore[arg-type]
    assert repo.pulse_for([]) == []
    assert repo.pulse_for(["  ", ""]) == []


def test_pulse_for_is_one_snapshot_lookup() -> None:
    now = datetime.now(timezone.utc)
    db = _FakeSnapshot(
        [
            {
                "sort_key": sort_key_for("Acme"),
                "open_roles": 3,
                "weekly_delta": 2,
                "last_seen_at": now.isoformat(),
                "inflow_by_day": _inflow(SERIES_DAYS - 1, SERIES_DAYS - 4),
            },
            {
                "sort_key": sort_key_for("Stale Co"),
                "open_roles": 0,
                "weekly_delta": 0,
                "last_seen_at": None,
                "inflow_by_day": [0] * SERIES_DAYS,
            },
        ]
    )
    repo = CompanySignalsRepository(db)  # type: ignore[arg-type]
    out = repo.pulse_for(["Acme", "Stale Co", "Ghost"])
    assert db.tables == ["company_pulse_snapshot"]
    assert db.in_keys == [
        sort_key_for("Acme"),
        sort_key_for("Stale Co"),
        sort_key_for("Ghost"),
    ]
    by_name = {row["company_name"]: row for row in out}

    acme = by_name["Acme"]
    assert acme["open_roles"] == 3
    assert acme["weekly_delta"] == 2
    assert acme["pulse"] == compute_pulse(3, 2, 0)
    assert acme["last_seen_at"] is not None
    assert any(value > 0 for value in acme["series"])

    assert by_name["Stale Co"]["pulse"] is None
    ghost = by_name["Ghost"]
    assert ghost["open_roles"] == 0
    assert ghost["weekly_delta"] == 0
    assert ghost["pulse"] is None
    assert ghost["series"] == [0] * SERIES_DAYS


def test_pulse_for_preserves_caller_order_and_requested_casing() -> None:
    db = _FakeSnapshot(
        [
            {
                "sort_key": sort_key_for("acme"),
                "open_roles": 1,
                "weekly_delta": 0,
                "last_seen_at": None,
                "inflow_by_day": [0] * SERIES_DAYS,
            }
        ]
    )
    repo = CompanySignalsRepository(db)  # type: ignore[arg-type]
    out = repo.pulse_for(["  acme ", "Ghost", "ACME"])
    assert [row["company_name"] for row in out] == ["acme", "Ghost", "ACME"]
    assert db.in_keys == [sort_key_for("acme"), sort_key_for("Ghost")]
    assert out[0]["open_roles"] == 1
    assert out[2]["open_roles"] == 1


def test_pulse_for_degrades_to_emdash_when_snapshot_is_down() -> None:
    class _Down:
        def table(self, name: str) -> "_Down":
            assert name == "company_pulse_snapshot"
            return self

        def select(self, _columns: str) -> "_Down":
            return self

        def in_(self, _column: str, _values: list[str]) -> "_Down":
            return self

        def execute(self) -> Any:
            raise APIError({"message": "Supabase unavailable", "code": "500"})

    repo = CompanySignalsRepository(_Down())  # type: ignore[arg-type]
    out = repo.pulse_for(["Acme"])
    assert out[0]["company_name"] == "Acme"
    assert out[0]["pulse"] is None
    assert out[0]["series"] == [0] * SERIES_DAYS
