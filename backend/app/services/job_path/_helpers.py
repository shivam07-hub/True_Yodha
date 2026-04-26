"""
Shared primitives for the job_path package — string normalisation, time
formatting, ISO date parsing, and a Supabase result shim.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any


def _key(value: str | None) -> str:
    return (value or "").strip().lower()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _single_or_none(query: Any) -> dict[str, Any] | None:
    result = query.execute()
    return result.data if isinstance(result.data, dict) else (result.data[0] if result.data else None)
