"""The shared secret pg_cron presents when it calls the API (`X-Myro-Refresh-Secret`).

One guard for every scheduled call from the database: the Tier-0 snapshot
refresh and the daily Notice closer. The value lives in Supabase vault as
`myro_analytics_refresh_secret` and on the API as MYRO_ANALYTICS_REFRESH_SECRET.
"""

from __future__ import annotations

import os
import secrets

from fastapi import HTTPException, status


def require_refresh_secret(value: str) -> None:
    expected = os.environ.get("MYRO_ANALYTICS_REFRESH_SECRET", "").strip()
    if not expected or not secrets.compare_digest(value, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="invalid refresh secret",
        )
