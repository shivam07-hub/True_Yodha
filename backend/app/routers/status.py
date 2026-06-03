import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from app.database import get_supabase_admin

router = APIRouter(prefix="/v1", tags=["status"])

_cache_data: dict | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 5.0


def _git_version() -> str:
    sha = os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")
    return sha[:7] if sha else "dev"


def _ping_db() -> bool:
    try:
        get_supabase_admin().table("user_profiles").select("id").limit(1).execute()
        return True
    except Exception:
        return False


@router.get("/status")
def get_status() -> dict:
    global _cache_data, _cache_ts
    now = time.monotonic()
    if _cache_data is not None and now - _cache_ts < _CACHE_TTL:
        return _cache_data

    status = "ready" if _ping_db() else "degraded"
    data: dict = {
        "status": status,
        "version": _git_version(),
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    _cache_data = data
    _cache_ts = now
    return data
