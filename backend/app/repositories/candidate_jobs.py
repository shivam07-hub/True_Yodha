"""Match-run candidate pool — one body-encoded RPC, paginated.

Replaces the skill-overlap + location + freshness + get_jobs_by_ids chain
that threw `httpx.InvalidURL` at ~3,440 ids (38% of users) and silently
truncated everyone else at PostgREST's 1,000-row cap.
"""
from __future__ import annotations

import logging
from typing import Any

from supabase import Client

_RPC_NAME = "candidate_jobs_for_user"
_PAGE_SIZE = 1_000
_MAX_PAGES = 20

logger = logging.getLogger(__name__)


def normalize_skill_keys(skill_keys: list[str]) -> list[str]:
    """Preserve Lightcast canonical case; drop blanks and duplicates."""
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in skill_keys:
        key = (raw or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def lowercase_countries(countries: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in countries or []:
        country = (raw or "").strip().lower()
        if not country or country in seen:
            continue
        seen.add(country)
        out.append(country)
    return out


def fetch_candidate_jobs(
    db: Client,
    skill_keys: list[str],
    *,
    countries: list[str] | None = None,
    require_fresh: bool = True,
) -> list[dict[str, Any]]:
    """Eligibility-column rows for jobs that overlap `skill_keys`.

    The RPC does not decide eligibility. Callers run `job_is_eligible` in
    Python over the returned rows.
    """
    keys = normalize_skill_keys(skill_keys)
    if not keys:
        return []

    params: dict[str, Any] = {
        "p_skill_keys": keys,
        "p_countries": lowercase_countries(countries),
        "p_require_fresh": require_fresh,
        "p_limit": _PAGE_SIZE,
    }

    rows: list[dict[str, Any]] = []
    after: str | None = None
    for _ in range(_MAX_PAGES):
        page_params = dict(params)
        if after is not None:
            page_params["p_after_job_id"] = after
        page = db.rpc(_RPC_NAME, page_params).execute().data or []
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            return rows
        after = str(page[-1]["job_id"])

    logger.warning(
        "metric candidate_jobs.page_cap skill_keys=%s pages=%s rows=%s",
        len(keys),
        _MAX_PAGES,
        len(rows),
    )
    return rows
