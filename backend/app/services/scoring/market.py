"""Market skill demand — cached read of public.jobs main/side skills."""

import logging
import time

from app.repositories.scores import ScoresRepository

logger = logging.getLogger(__name__)

_DEMAND_CACHE: dict[str, int] = {}
_DEMAND_CACHE_TS: float = 0.0
_DEMAND_CACHE_TTL = 3600


def fetch_skill_demand(scores_repo: ScoresRepository) -> dict[str, int]:
    """{skill_name: job_count} across jobs.main_skills (×2) + side_skills.

    Cached for _DEMAND_CACHE_TTL seconds — market demand only changes on
    job feed refreshes.
    """
    global _DEMAND_CACHE, _DEMAND_CACHE_TS
    if _DEMAND_CACHE and (time.monotonic() - _DEMAND_CACHE_TS) < _DEMAND_CACHE_TTL:
        return _DEMAND_CACHE
    try:
        rows = scores_repo.list_market_skill_rows()
    except Exception as exc:
        logger.warning("Market skill demand lookup failed: %s", exc)
        return _DEMAND_CACHE or {}
    counts: dict[str, int] = {}
    for row in rows:
        for s in (row.get("main_skills") or []):
            if s and s.strip():
                counts[s.strip()] = counts.get(s.strip(), 0) + 2
        for s in (row.get("side_skills") or []):
            if s and s.strip():
                counts[s.strip()] = counts.get(s.strip(), 0) + 1
    _DEMAND_CACHE = counts
    _DEMAND_CACHE_TS = time.monotonic()
    return counts
