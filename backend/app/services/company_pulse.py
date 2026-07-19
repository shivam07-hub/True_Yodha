"""Demand pulse — a deterministic 0-100 index of how hard a company is hiring.

Signal Thread S2. The pulse is a transparent derived index over three REAL
signals (no fabrication, ADR-0016):

  * volume    — how many live roles the company has open right now
  * momentum  — how many of those are new this week (fresh inflow)
  * freshness — how recently we last saw the company in a crawl

The repository supplies the three raw counts (from the jobs table's first_seen /
last_seen scrape markers); this module owns only the normalisation + weighting
so the formula is unit-testable without a database and can never disagree
between the compare strip and the directory.

Where a company has no live roles at all, `pulse` is None (syncing / no signal)
rather than a fabricated 0 — the caller renders the em-dash state.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# A company with this many live roles saturates the volume component. Chosen so
# the biggest MNCs (~a few hundred open roles) land near the top of the scale
# while a 20-role company still reads as meaningfully active.
VOLUME_SATURATION = 150
# Weekly inflow of this fraction of the open stack saturates momentum — a
# company refreshing a fifth of its roles in a week is hiring hard.
MOMENTUM_TURNOVER = 0.20
MOMENTUM_FLOOR = 5  # small companies: 5 new roles this week already reads hot
# Freshness decays to zero over the same window the feed uses to call a listing
# stale, so pulse and the stale badge can never disagree.
FRESHNESS_WINDOW_DAYS = 21

_W_VOLUME = 0.5
_W_MOMENTUM = 0.3
_W_FRESHNESS = 0.2

SERIES_DAYS = 30
_SERIES_ROLLING = 14  # each series point = new roles first-seen in the trailing 14d


@dataclass(frozen=True)
class CompanyPulse:
    open_roles: int
    weekly_delta: int
    days_since_last_seen: int | None
    pulse: int | None
    series: list[int]


def _volume_component(open_roles: int) -> float:
    if open_roles <= 0:
        return 0.0
    return min(1.0, math.log1p(open_roles) / math.log1p(VOLUME_SATURATION))


def _momentum_component(open_roles: int, weekly_delta: int) -> float:
    if weekly_delta <= 0:
        return 0.0
    denom = max(MOMENTUM_FLOOR, open_roles * MOMENTUM_TURNOVER)
    return min(1.0, weekly_delta / denom)


def _freshness_component(days_since_last_seen: int | None) -> float:
    if days_since_last_seen is None:
        return 0.0
    if days_since_last_seen <= 0:
        return 1.0
    return max(0.0, 1.0 - days_since_last_seen / FRESHNESS_WINDOW_DAYS)


def compute_pulse(
    open_roles: int,
    weekly_delta: int,
    days_since_last_seen: int | None,
) -> int | None:
    """0-100 demand pulse, or None when the company has no live roles.

    None (not 0) is the honest 'no signal / syncing' value — a company with zero
    open roles isn't 'ice cold at 0', it simply has nothing to score.
    """
    if open_roles <= 0:
        return None
    score = (
        _W_VOLUME * _volume_component(open_roles)
        + _W_MOMENTUM * _momentum_component(open_roles, weekly_delta)
        + _W_FRESHNESS * _freshness_component(days_since_last_seen)
    )
    return round(100 * score)


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
    series: list[int] = []
    running = 0
    for i in range(days):
        running += per_day[i]
        if i - _SERIES_ROLLING >= 0:
            running -= per_day[i - _SERIES_ROLLING]
        series.append(running)
    return series
