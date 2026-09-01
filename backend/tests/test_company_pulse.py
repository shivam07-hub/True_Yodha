from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from postgrest.exceptions import APIError

from app.repositories import jobs as jobs_module
from app.repositories.jobs import JobsRepository
from app.routers.jobs.list import get_indexable_companies
from app.services import shared_cache
from app.services.background import debounce
from app.services.company_pulse import (
    SERIES_DAYS,
    build_series,
    compute_pulse,
)


def setup_function() -> None:
    # fetch_company_pulse / fetch_indexable_companies now route through the
    # shared, cross-replica cache (ARCHITECTURE_READ_PATH.md S3) instead of a
    # per-process dict — clear its (test-env) local-dict fallback and the
    # single-flight claims between tests so one test's cache entry can't
    # leak into the next.
    shared_cache._LOCAL_CACHE.clear()
    debounce._LOCAL_CLAIMS.clear()


def _marker(days_ago: int) -> int:
    return int((datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y%m%d"))


def test_no_open_roles_is_none_not_zero() -> None:
    # A company with nothing live has no signal to score — None, never 0.
    assert compute_pulse(0, 0, 0) is None
    assert compute_pulse(0, 5, 1) is None


def test_pulse_is_bounded_0_100() -> None:
    for open_roles in (1, 20, 150, 500):
        for delta in (0, 5, 40):
            for stale in (0, 10, 40, None):
                p = compute_pulse(open_roles, delta, stale)
                assert p is not None
                assert 0 <= p <= 100


def test_more_open_roles_raises_pulse() -> None:
    low = compute_pulse(5, 0, 0)
    high = compute_pulse(120, 0, 0)
    assert low is not None and high is not None
    assert high > low


def test_fresh_inflow_raises_pulse() -> None:
    quiet = compute_pulse(50, 0, 0)
    hiring = compute_pulse(50, 20, 0)
    assert quiet is not None and hiring is not None
    assert hiring > quiet


def test_staleness_lowers_pulse() -> None:
    fresh = compute_pulse(50, 5, 0)
    stale = compute_pulse(50, 5, 40)  # beyond the 21-day window → freshness 0
    assert fresh is not None and stale is not None
    assert fresh > stale


def test_missing_last_seen_treated_as_stale_not_crash() -> None:
    p = compute_pulse(50, 5, None)
    assert p is not None and 0 <= p <= 100


def test_series_length_and_empty() -> None:
    assert build_series([]) == [0] * SERIES_DAYS
    assert len(build_series([0, 5, 29])) == SERIES_DAYS


def test_series_rolling_window_decays() -> None:
    # A single burst of 3 roles on day 0 should show up early then roll off after
    # 14 days (the trailing window), returning to 0.
    series = build_series([0, 0, 0])
    assert series[0] == 3
    assert series[13] == 3  # still inside the 14-day trailing window
    assert series[14] == 0  # rolled off
    assert series[SERIES_DAYS - 1] == 0


def test_series_ignores_out_of_window_offsets() -> None:
    assert build_series([-1, 99, 3]) == build_series([3])


# ── Repository DB-scan → pulse mapping ──────────────────────────────────────


def _pulse_rows(monkeypatch, rows: list[dict[str, Any]]):
    monkeypatch.setattr(jobs_module, "fetch_all_rows", lambda *a, **k: rows)
    repo = JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]
    return repo.fetch_company_pulse(["Acme", "Stale Co", "Ghost"])


def test_fetch_company_pulse_maps_real_markers(monkeypatch) -> None:
    rows = [
        # Acme — 3 live roles; 2 first-seen within the last 7d.
        {"company_name": "Acme", "first_seen": _marker(0), "last_seen": _marker(0)},
        {"company_name": "  acme ", "first_seen": _marker(3), "last_seen": _marker(1)},  # case/space variant
        {"company_name": "Acme", "first_seen": _marker(40), "last_seen": _marker(2)},
        # Stale Co — last seen well beyond the freshness window → no live roles.
        {"company_name": "Stale Co", "first_seen": _marker(50), "last_seen": _marker(40)},
    ]
    out = _pulse_rows(monkeypatch, rows)
    by_name = {r["company_name"]: r for r in out}

    acme = by_name["Acme"]
    assert acme["open_roles"] == 3  # all three last_seen within 21d
    assert acme["weekly_delta"] == 2  # first_seen 0d + 3d ago
    assert acme["pulse"] is not None and 0 < acme["pulse"] <= 100
    assert acme["last_seen_at"] is not None
    assert len(acme["series"]) == SERIES_DAYS
    assert any(v > 0 for v in acme["series"])  # real inflow shows

    stale = by_name["Stale Co"]
    assert stale["open_roles"] == 0
    assert stale["pulse"] is None  # no live roles → no fabricated 0

    ghost = by_name["Ghost"]
    assert ghost["open_roles"] == 0
    assert ghost["weekly_delta"] == 0
    assert ghost["pulse"] is None
    assert ghost["series"] == [0] * SERIES_DAYS


def test_fetch_company_pulse_preserves_input_order(monkeypatch) -> None:
    out = _pulse_rows(monkeypatch, [])
    assert [r["company_name"] for r in out] == ["Acme", "Stale Co", "Ghost"]


def test_fetch_company_pulse_empty_input_short_circuits() -> None:
    repo = JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]
    assert repo.fetch_company_pulse([]) == []
    assert repo.fetch_company_pulse(["  ", ""]) == []


# ── Indexable-companies allowlist (SEO sitemap gate, GSC 2026-07-23) ─────────


class _FakeIndexableRpc:
    """Models the `indexable_companies` GROUP BY over a fake jobs table.

    The dedupe/count/sort used to live in Python and was asserted directly.
    It now lives in SQL, so this fake replicates the function's contract —
    group on btrim(company_name), drop blank/NULL, order by count desc then
    lower(name) — and the assertions below still fail if that contract moves.
    """

    def __init__(self, job_rows: list[dict[str, Any]]) -> None:
        self._job_rows = job_rows
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any]) -> "_FakeIndexableRpc":
        self.calls.append((name, params))
        assert name == "indexable_companies"
        return self

    def execute(self) -> Any:
        counts: dict[str, int] = {}
        for row in self._job_rows:
            grouped = (row.get("company_name") or "").strip()
            if not grouped:
                continue
            counts[grouped] = counts.get(grouped, 0) + 1
        ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))
        return type(
            "_Result",
            (),
            {"data": [{"name": n, "active_count": c} for n, c in ordered]},
        )()


def test_fetch_indexable_companies_dedupes_counts_and_sorts() -> None:
    # The function scans jobs already filtered to live rows (is_active AND
    # confidence=active) — the fake holds that filtered set. Distinct companies
    # with a role count, sorted by count desc then name.
    job_rows = [
        {"company_name": "Wipro"},
        {"company_name": "Wipro"},
        {"company_name": "Wipro"},
        {"company_name": " Axis Bank "},  # trimmed, and groups with the next row
        {"company_name": "Axis Bank"},
        {"company_name": ""},  # blank dropped
        {"company_name": None},  # null dropped
    ]
    admin = _FakeIndexableRpc(job_rows)
    repo = JobsRepository(db=object(), admin_db=admin)  # type: ignore[arg-type]
    out = repo.fetch_indexable_companies()
    assert out == [
        {"name": "Wipro", "active_count": 3},
        {"name": "Axis Bank", "active_count": 2},
    ]
    # One round trip, not a page-scan — the whole point of the RPC.
    assert admin.calls == [("indexable_companies", {})]


def test_fetch_indexable_companies_empty_when_no_live_rows() -> None:
    repo = JobsRepository(db=object(), admin_db=_FakeIndexableRpc([]))  # type: ignore[arg-type]
    assert repo.fetch_indexable_companies() == []


def test_fetch_indexable_companies_propagates_a_cold_cache_failure(monkeypatch) -> None:
    repo = JobsRepository(db=object(), admin_db=_FakeIndexableRpc([]))  # type: ignore[arg-type]

    def _unavailable(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        raise APIError({"message": "Supabase unavailable", "code": "500"})

    monkeypatch.setattr(shared_cache, "get_or_compute", _unavailable)

    with pytest.raises(APIError):
        repo.fetch_indexable_companies()


def test_indexable_companies_marks_a_cold_cache_failure_unavailable() -> None:
    """An upstream miss is not evidence that there are zero live companies."""

    class _UnavailableRepository:
        def fetch_indexable_companies(self) -> list[dict[str, Any]]:
            raise APIError({"message": "Supabase unavailable", "code": "500"})

    response = get_indexable_companies(repo=_UnavailableRepository())  # type: ignore[arg-type]

    assert response.status == "unavailable"
    assert response.companies == []


# ── Per-company cache identity (ARCHITECTURE_READ_PATH.md §16 P4) ────────────


def _scan_counting_repo(monkeypatch) -> tuple[JobsRepository, list[list[str]]]:
    """Repo whose every jobs scan is recorded, with the companies it scanned."""
    scans: list[list[str]] = []

    class _Q:
        def __init__(self) -> None:
            self.names: list[str] = []

        def in_(self, _column: str, values: list[str]) -> "_Q":
            self.names = list(values)
            return self

    def _fake_fetch_all_rows(_db, *, table, columns, query_builder):  # noqa: ANN001
        query = query_builder(_Q())
        scans.append(query.names)
        return [
            {"company_name": name, "first_seen": _marker(1), "last_seen": _marker(1)}
            for name in query.names
        ]

    monkeypatch.setattr(jobs_module, "fetch_all_rows", _fake_fetch_all_rows)
    return JobsRepository(db=object(), admin_db=object()), scans  # type: ignore[arg-type]


def test_a_warm_company_is_not_rescanned_for_a_new_set(monkeypatch) -> None:
    """The fix: a set is a lookup of its members, not its own cold fill.

    Set-keyed caching meant a rail showing twelve companies shared nothing with
    the same rail plus one, and each miss rescanned every job row for the whole
    set — the 8,060-27,409ms evictor behind the correlated multi-route windows.
    """
    repo, scans = _scan_counting_repo(monkeypatch)

    repo.fetch_company_pulse(["Acme", "Globex"])
    assert scans == [["Acme", "Globex"]]

    # Superset: only the genuinely new company may be scanned.
    out = repo.fetch_company_pulse(["Acme", "Globex", "Initech"])
    assert scans[1] == ["Initech"], (
        f"a superset rescanned {scans[1]} — the cache is still keyed on the set, "
        "so every distinct company set pays its own full scan."
    )
    assert [row["company_name"] for row in out] == ["Acme", "Globex", "Initech"]

    # A fully warm subset must not touch the database at all.
    before = len(scans)
    subset = repo.fetch_company_pulse(["Globex", "Acme"])
    assert len(scans) == before, "a fully cached subset still issued a scan"
    assert [row["company_name"] for row in subset] == ["Globex", "Acme"]


def test_pulse_cache_key_ignores_case_and_spacing() -> None:
    assert jobs_module._pulse_cache_key("Bain & Company") == jobs_module._pulse_cache_key(
        "bain  &  COMPANY"
    )


def test_caller_order_survives_a_partial_cache_hit(monkeypatch) -> None:
    repo, _ = _scan_counting_repo(monkeypatch)
    repo.fetch_company_pulse(["Globex"])
    out = repo.fetch_company_pulse(["Initech", "Globex", "Acme"])
    assert [row["company_name"] for row in out] == ["Initech", "Globex", "Acme"]
