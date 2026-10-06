"""Demand pulse — a deterministic 0-100 index of how hard a company is hiring.

Signal Thread S2. The pulse is a transparent derived index over two REAL
signals (no fabrication, ADR-0016):

  * volume   — how many live roles the company has open right now
  * momentum — how many of those are new this week (fresh inflow)

There is no freshness term (Shivam, 2026-10-07). It read the verifier's last
check, and 28 companies holding 36% of live roles (Axis Bank, Infosys, Google)
answer the verifier with errors: they lost 20 points for Myro's blind spot,
not for how they hire. The crawler's date before it was the same day for
every company.

The Company Demand Pulse snapshot supplies the raw counts; this module
owns only the normalisation + weighting so the formula is unit-testable without
a database and can never disagree between the compare strip and the directory.

Where a company has no live roles at all, `pulse` is None (syncing / no signal)
rather than a fabricated 0 — the caller renders the em-dash state.
"""

from __future__ import annotations

import math
from typing import Any

# A company with this many live roles saturates the volume component. Chosen so
# the biggest MNCs (~a few hundred open roles) land near the top of the scale
# while a 20-role company still reads as meaningfully active.
VOLUME_SATURATION = 150
# Weekly inflow of this fraction of the open stack saturates momentum — a
# company refreshing a fifth of its roles in a week is hiring hard.
MOMENTUM_TURNOVER = 0.20
MOMENTUM_FLOOR = 5  # small companies: 5 new roles this week already reads hot

# Volume to momentum 5:3, scaled to 100.
_W_VOLUME = 0.625
_W_MOMENTUM = 0.375

SERIES_DAYS = 30
_SERIES_ROLLING = 14  # each series point = new roles first-seen in the trailing 14d


def _volume_component(open_roles: int) -> float:
    if open_roles <= 0:
        return 0.0
    return min(1.0, math.log1p(open_roles) / math.log1p(VOLUME_SATURATION))


def _momentum_component(open_roles: int, weekly_delta: int) -> float:
    if weekly_delta <= 0:
        return 0.0
    denom = max(MOMENTUM_FLOOR, open_roles * MOMENTUM_TURNOVER)
    return min(1.0, weekly_delta / denom)


def compute_pulse(open_roles: int, weekly_delta: int) -> int | None:
    """0-100 demand pulse, or None when the company has no live roles.

    None (not 0) is the honest 'no signal / syncing' value — a company with zero
    open roles isn't 'ice cold at 0', it simply has nothing to score.
    """
    if open_roles <= 0:
        return None
    score = (
        _W_VOLUME * _volume_component(open_roles)
        + _W_MOMENTUM * _momentum_component(open_roles, weekly_delta)
    )
    return round(100 * score)


def sort_key_for(company: str) -> str:
    """Case- and whitespace-insensitive company identity.

    "Bain & Company" and "bain  &  COMPANY" are the same Company Demand Pulse
    row. Matches how scrape casings were already folded on the old scan path.
    """
    return " ".join(company.casefold().split())


def build_series_from_histogram(per_day: list[int], *, days: int = SERIES_DAYS) -> list[int]:
    """Sparkline from a `days`-length histogram of first-seen counts (oldest first)."""
    padded = (list(per_day) + [0] * days)[:days]
    series: list[int] = []
    running = 0
    for i in range(days):
        running += padded[i]
        if i - _SERIES_ROLLING >= 0:
            running -= padded[i - _SERIES_ROLLING]
        series.append(running)
    return series


def build_series(day_offsets: list[int], *, days: int = SERIES_DAYS) -> list[int]:
    """A `days`-length sparkline: each point is the count of roles first seen in
    the trailing 14 days as of that day. `day_offsets` are per-role integers in
    [0, days) where 0 = oldest day in the window and days-1 = today (a role's
    first_seen day bucket). Roles outside the window are pre-filtered out by the
    caller. Deterministic; empty input → all zeros.
    """
    per_day = [0] * days
    for off in day_offsets:
        if 0 <= off < days:
            per_day[off] += 1
    return build_series_from_histogram(per_day, days=days)


def project_item(
    *,
    company_name: str,
    open_roles: int = 0,
    weekly_delta: int = 0,
    inflow_by_day: list[int] | None = None,
) -> dict[str, Any]:
    """HTTP pulse row from snapshot fields. Ghost companies pass zeros."""
    return {
        "company_name": company_name,
        "open_roles": open_roles,
        "weekly_delta": weekly_delta,
        "pulse": compute_pulse(open_roles, weekly_delta),
        "series": build_series_from_histogram(inflow_by_day or [0] * SERIES_DAYS),
    }
