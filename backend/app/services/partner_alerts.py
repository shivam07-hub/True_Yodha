"""partner_alerts — the job openings we hand a partner for one of their users.

Deliberately LLM-free. Myro's ranked match is user-pulled because ranking costs
provider budget and Shivam's model is "compute follows intent" (see
`services/new_inventory.py`). A partner alert fires for people who are not on the
site and may never come back, so it rides the same deterministic feed the /market
triage list uses — role family, seniority band, saved locations, CV skill overlap
— and never the Matching Brain. Cached brain verdicts are not consulted either:
a payload that sometimes carries a score and sometimes doesn't is worse for the
partner than one that never does.

What stops repeats is the ledger (`partner_job_deliveries`), not a time window.
"""
from __future__ import annotations

import logging
from typing import Any

from app.repositories.partner_delivery import PartnerDeliveryRepository
from app.services.matching.filter_spec import FilterSpec
from app.services.matching.job_query import JobQuery

logger = logging.getLogger(__name__)

DEFAULT_JOBS_PER_USER = 10
MAX_JOBS_PER_USER = 25


def jobs_for_seat(
    jobs_repo: Any,
    delivery_repo: PartnerDeliveryRepository,
    *,
    seat: dict[str, Any],
    limit: int = DEFAULT_JOBS_PER_USER,
    max_experience_years: int | None = None,
    exclude_delivered: bool = True,
) -> list[dict[str, Any]]:
    """Openings this seat has not been told about yet, freshest first.

    `exclude_delivered=False` is the read-only preview a partner uses while
    integrating: same query, but it does not pretend the ledger is empty when
    it isn't — it simply ignores it, and records nothing.
    """
    user_id = seat.get("user_id")
    if not user_id:
        return []
    limit = max(1, min(limit, MAX_JOBS_PER_USER))

    exclude: set[str] = set()
    if exclude_delivered:
        exclude = delivery_repo.delivered_job_ids(str(seat["id"]))

    eligibility = _eligibility(jobs_repo, user_id)
    spec = FilterSpec(
        sort="fresh",
        location_prefs=tuple(_safe(jobs_repo.user_target_locations, user_id, default=[])),
        page=1,
        # Over-fetch: the experience filter below is applied after shaping, so a
        # page sized exactly to `limit` could come back short of it.
        page_size=limit * 3,
    )
    result = JobQuery.feed(
        jobs_repo,
        spec,
        user_skill_keys=_safe(jobs_repo.user_skill_keys, user_id, default=set()),
        user_target_roles=_safe(jobs_repo.get_user_target_roles, user_id, default=[]),
        primary_career_band=eligibility.get("target_career_band"),
        explored_career_bands=eligibility.get("explored_career_bands") or [],
        target_seniority=eligibility.get("target_seniority") or "any",
        exclude_job_ids=exclude,
    )
    rows = [r for r in (result.get("rows") or []) if r.get("job_id")]
    rows = [r for r in rows if not r.get("is_stale")]
    if max_experience_years is not None:
        rows = [r for r in rows if _min_years(r) <= max_experience_years]
    return [_shape(r) for r in rows[:limit]]


def _eligibility(jobs_repo: Any, user_id: str) -> dict[str, Any]:
    getter = getattr(jobs_repo, "get_user_eligibility_preferences", None)
    if getter is None:
        return {}
    try:
        return getter(user_id) or {}
    except Exception as exc:  # noqa: BLE001 — an unset profile is not an error
        logger.warning("partner_alerts eligibility read failed user=%s: %s", user_id, exc)
        return {}


def _safe(fn: Any, user_id: str, *, default: Any) -> Any:
    try:
        return fn(user_id)
    except Exception as exc:  # noqa: BLE001 — a missing preference narrows, never 500s
        logger.warning("partner_alerts read failed fn=%s user=%s: %s", getattr(fn, "__name__", "?"), user_id, exc)
        return default


def _min_years(row: dict[str, Any]) -> int:
    value = row.get("min_years_experience")
    try:
        return int(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0


def _shape(row: dict[str, Any]) -> dict[str, Any]:
    """The partner-facing job object. A stable, documented subset — internal feed
    fields (skill overlap counts, verdicts, staleness flags) stay internal so the
    contract does not leak our ranking model."""
    return {
        "job_id": str(row.get("job_id")),
        "title": row.get("job_title") or "",
        "company": row.get("company_name"),
        "location": row.get("location"),
        "location_city": row.get("location_city"),
        "location_country": row.get("location_country"),
        "work_mode": row.get("location_mode"),
        "role_domain": row.get("role_domain"),
        "seniority_level": row.get("seniority_level"),
        "min_years_experience": row.get("min_years_experience"),
        "max_years_experience": row.get("max_years_experience"),
        "skills": row.get("skills") or [],
        "apply_url": row.get("source_url"),
        "first_seen_at": row.get("first_seen"),
    }
