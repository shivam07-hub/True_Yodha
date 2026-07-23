from datetime import datetime, timedelta, timezone
from typing import Any

from app.repositories import jobs as jobs_module
from app.repositories.jobs import JobsRepository
from app.services.company_pulse import (
    SERIES_DAYS,
    build_series,
    compute_pulse,
)


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
    jobs_module._pulse_cache.clear()
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


def test_fetch_indexable_companies_dedupes_counts_and_sorts(monkeypatch) -> None:
    # The repo scans jobs already filtered to live rows (is_active AND
    # confidence=active) — the fake returns that filtered set. Method dedupes to
    # distinct companies with a role count, sorted by count desc then name.
    rows = [
        {"company_name": "Wipro"},
        {"company_name": "Wipro"},
        {"company_name": "Wipro"},
        {"company_name": " Axis Bank "},  # trimmed
        {"company_name": "Axis Bank"},
        {"company_name": ""},  # blank dropped
        {"company_name": None},  # null dropped
    ]
    monkeypatch.setattr(jobs_module, "fetch_all_rows", lambda *a, **k: rows)
    jobs_module._indexable_companies_cache = None
    repo = JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]
    out = repo.fetch_indexable_companies()
    assert out == [
        {"name": "Wipro", "active_count": 3},
        {"name": "Axis Bank", "active_count": 2},
    ]


def test_fetch_indexable_companies_empty_when_no_live_rows(monkeypatch) -> None:
    monkeypatch.setattr(jobs_module, "fetch_all_rows", lambda *a, **k: [])
    jobs_module._indexable_companies_cache = None
    repo = JobsRepository(db=object(), admin_db=object())  # type: ignore[arg-type]
    assert repo.fetch_indexable_companies() == []
