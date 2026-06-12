"""Public, no-auth platform stats — landing-page Engine counters.

GET /public/stats returns the live counts behind the landing page's
"Engine" section (design spec docs/DESIGN_landing_myro_engine.md §6).
Cached in-process for 1h — this endpoint must never add DB pressure
per pageview. The frontend floors the values for display ("4,300+")
so public numbers only ever grow.
"""

import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from app.database import get_supabase_admin
from app.repositories.jobs import get_public_jobs_repository

router = APIRouter(prefix="/public", tags=["public"])

# Taxonomy size is effectively static (Lightcast-scale skill graph); not worth
# a per-hour count query. Update alongside taxonomy upgrades.
SKILLS_MAPPED = 32_000

_CACHE_TTL_SECONDS = 3600.0
_cache_data: dict[str, Any] | None = None
_cache_ts: float = 0.0


def _count_seekers() -> int:
    result = (
        get_supabase_admin()
        .table("user_profiles")
        .select("id", count="exact")
        .limit(1)
        .execute()
    )
    return int(result.count or 0)


@router.get("/stats")
def get_public_stats() -> dict[str, Any]:
    global _cache_data, _cache_ts

    now = time.monotonic()
    if _cache_data is not None and now - _cache_ts < _CACHE_TTL_SECONDS:
        return _cache_data

    # compile_market_analytics is snapshot-backed + in-process cached, so this
    # is cheap after the first call.
    analytics = get_public_jobs_repository().compile_market_analytics()

    data: dict[str, Any] = {
        "jobs_tracked": int(analytics.get("total_jobs") or 0),
        "companies_monitored": int(analytics.get("total_companies") or 0),
        "skills_mapped": SKILLS_MAPPED,
        "seekers": _count_seekers(),
        "as_of": datetime.now(timezone.utc).isoformat(),
    }
    _cache_data = data
    _cache_ts = now
    return data
