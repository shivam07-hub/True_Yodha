"""IST billing month — the period a ₹199 engagement pass belongs to.

MTR4: billing months are IST (+05:30). A charge at 4am IST on the 1st is still
that month; UTC would put it in the previous one. Conversion is theirs; the
month is only how long we staff the scene.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))


def _as_ist(now: datetime | None = None) -> datetime:
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(IST)


def ist_month_start(now: datetime | None = None) -> date:
    local = _as_ist(now)
    return date(local.year, local.month, 1)


def ist_period_end(now: datetime | None = None) -> datetime:
    """First instant of the next IST month, as an aware datetime."""
    start = ist_month_start(now)
    if start.month == 12:
        nxt = date(start.year + 1, 1, 1)
    else:
        nxt = date(start.year, start.month + 1, 1)
    return datetime.combine(nxt, time.min, tzinfo=IST)


def in_current_period(requested_at: Any, now: datetime | None = None) -> bool:
    """True when ``requested_at`` falls in the current IST billing month."""
    if requested_at is None:
        return False
    if isinstance(requested_at, datetime):
        moment = requested_at
    else:
        try:
            moment = datetime.fromisoformat(str(requested_at).replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    start = datetime.combine(ist_month_start(now), time.min, tzinfo=IST)
    return start <= moment < ist_period_end(now)
