"""Market skill demand — cached read of public.jobs main/side skills."""

import logging
import time

from app.repositories.scores import ScoresRepository

logger = logging.getLogger(__name__)

_DEMAND_CACHE: dict[str, int] = {}
_DEMAND_CACHE_TS: float = 0.0
_DEMAND_CACHE_TTL = 3600
_SCOPED_DEMAND_CACHE: dict[str, tuple[float, int]] = {}


def fetch_skill_demand(
    scores_repo: ScoresRepository,
    skill_keys: set[str] | None = None,
) -> dict[str, int]:
    """{skill_name: job_count} across jobs.main_skills (×2) + side_skills.

    Cached for _DEMAND_CACHE_TTL seconds — market demand only changes on
    job feed refreshes.
    """
    if skill_keys is not None:
        scoped = frozenset(key.strip() for key in skill_keys if key and key.strip())
        if not scoped:
            return {}
        now = time.monotonic()
        cached = {
            key: demand
            for key in scoped
            for cached_at, demand in [_SCOPED_DEMAND_CACHE.get(key, (0.0, 0))]
            if cached_at and (now - cached_at) < _DEMAND_CACHE_TTL
        }
        missing = set(scoped) - set(cached)
        if not missing:
            return cached
        try:
            fresh = scores_repo.get_skill_demand_for_keys(missing)
        except Exception as exc:
            logger.warning("Scoped market skill demand lookup failed: %s", exc)
            return cached
        for key in missing:
            _SCOPED_DEMAND_CACHE[key] = (now, int(fresh.get(key, 0)))
        return {key: _SCOPED_DEMAND_CACHE[key][1] for key in scoped}

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
