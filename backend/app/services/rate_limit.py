from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

_COOLDOWN_DAYS = 3


def assert_not_rate_limited(db, user_id: str, table: str, ts_col: str) -> None:
    """Raise HTTP 429 if user triggered an LLM call within the last 3 days."""
    result = (
        db.table(table)
        .select(ts_col)
        .eq("user_id", user_id)
        .order(ts_col, desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return

    last_ts = result.data[0][ts_col]
    if isinstance(last_ts, str):
        last_ts = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
    if last_ts.tzinfo is None:
        last_ts = last_ts.replace(tzinfo=timezone.utc)

    cooldown_until = last_ts + timedelta(days=_COOLDOWN_DAYS)
    now = datetime.now(timezone.utc)
    if now < cooldown_until:
        remaining = int((cooldown_until - now).total_seconds())
        hours, mins = remaining // 3600, (remaining % 3600) // 60
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit: next analysis available in {hours}h {mins}m.",
            headers={"Retry-After": str(remaining)},
        )
