"""partner_alerts — the job openings we hand a partner for one of their users.

Deliberately LLM-free. Myro's ranked match is user-pulled because ranking costs
provider budget and Shivam's model is "compute follows intent" (see
`services/new_inventory.py`). A partner alert fires for people who are not on the
site and may never come back, so it rides the same deterministic retrieval the
/market list uses — `shortlist_jobs`, which asks `candidates_for_user` for the
jobs this one person should see — and never the Matching Brain. One retrieval for
both surfaces is the point: while the feed sampled 500 rows by a shared date, a
partner carrying 37% of our users was being handed the same arbitrary slice. Cached brain verdicts are not consulted either:
a payload that sometimes carries a score and sometimes doesn't is worse for the
partner than one that never does.

What stops repeats is the ledger (`partner_job_deliveries`), not a time window.
"""
from __future__ import annotations

import logging
from typing import Any

from app.repositories.partner_delivery import PartnerDeliveryRepository

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
    """Openings this seat has not been told about yet, best match first.

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

    # Over-fetch: the staleness and experience filters below run after
    # retrieval, so asking for exactly `limit` could come back short of it.
    rows = jobs_repo.shortlist_jobs(
        user_id,
        skill_keys=_safe(jobs_repo.user_skill_keys, user_id, default=set()),
        target_roles=_safe(jobs_repo.get_user_target_roles, user_id, default=[]),
        limit=limit * 3,
    )
    rows = [r for r in rows if r.get("job_id") and not r.get("is_stale")]
    # The retrieval already drops what the user saved or skipped. This ledger is a
    # different question — what this SEAT has already been sent — and only the
    # partner's side knows it.
    if exclude:
        rows = [r for r in rows if str(r["job_id"]) not in exclude]
    if max_experience_years is not None:
        rows = [r for r in rows if _min_years(r) <= max_experience_years]
    return [_shape(r) for r in rows[:limit]]


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
