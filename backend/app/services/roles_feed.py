"""The recruiter live-role feed — Wave 2 slice 2.

Programmatic access to roles that are live *and re-checked at the source*. That
second half is the product: anyone can scrape a careers page, and the Ghost Job
Index says 61% of roles closed on an employer's own ATS are still sitting in
that employer's own feed. A feed that cannot tell you which of its rows are
still real is a list, not intelligence. Every row here carries its verification
state and when it was last confirmed, so a buyer can filter on trust rather than
take our word for it.

Sync shape, not a search box. The cursor walks FORWARD through `ingested_at`,
so a caller polls with the cursor they were last given and receives only what
has appeared since. Ordering descending would have been friendlier to eyeball
and useless to sync: a row inserted between two polls slides underneath the
window and is never seen again.

Metering follows MTR1 rather than inventing a unit: a role is billable once per
month however many times it is fetched. Polling hourly for freshness — the
entire point of a live feed — must not cost more than polling daily.
"""
from __future__ import annotations

import base64
import binascii
import json
import logging
from typing import Any

from app.database import get_supabase_admin

logger = logging.getLogger(__name__)

METRIC_ROLES_DELIVERED = "roles.delivered"

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

#: Columns the feed publishes. `listing_confidence` and `last_verified_live_at`
#: are not optional extras — they are the reason to buy this rather than scrape.
_COLUMNS = (
    "job_id, job_title, company_name, industry_group, role_family, career_band, "
    "seniority_level, location_city, location_country, work_mode, "
    "min_years_experience, max_years_experience, main_skills, apply_url, "
    "date_posted, ingested_at, listing_confidence, last_verified_live_at"
)


def encode_cursor(ingested_at: str, job_id: str) -> str:
    """Opaque and stable. A caller that can read the cursor will eventually
    construct one, and then its shape is our compatibility problem forever."""
    raw = json.dumps({"t": ingested_at, "j": job_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[str, str] | None:
    """None for anything unreadable. A bad cursor restarts the walk rather than
    erroring: a sync client that has lost its place needs to recover, not to be
    told it is holding it wrong."""
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        return str(data["t"]), str(data["j"])
    except (ValueError, KeyError, TypeError, binascii.Error):
        return None


def _row_to_role(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": row.get("job_id"),
        "title": row.get("job_title"),
        "company": row.get("company_name"),
        "sector": row.get("industry_group"),
        "role_family": row.get("role_family"),
        "career_band": row.get("career_band"),
        "seniority": row.get("seniority_level"),
        "location_city": row.get("location_city"),
        "location_country": row.get("location_country"),
        "work_mode": row.get("work_mode"),
        "min_years_experience": row.get("min_years_experience"),
        "max_years_experience": row.get("max_years_experience"),
        "skills": list(row.get("main_skills") or []),
        "apply_url": row.get("apply_url"),
        "date_posted": row.get("date_posted"),
        "first_seen_at": row.get("ingested_at"),
        # The trust half. `verified` is our own conclusive check at the source,
        # not the employer's word and not a scrape timestamp.
        "verification": {
            "state": row.get("listing_confidence"),
            "last_verified_live_at": row.get("last_verified_live_at"),
        },
    }


def fetch_roles(
    *,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
    sector: str | None = None,
    role_family: str | None = None,
    career_band: str | None = None,
    location_city: str | None = None,
) -> dict[str, Any]:
    """One page of live roles, oldest-ingested first, with a forward cursor."""
    limit = max(1, min(int(limit), MAX_LIMIT))
    db = get_supabase_admin()

    query = (
        db.table("jobs")
        .select(_COLUMNS)
        .eq("is_active", True)
        .eq("listing_confidence", "active")
    )
    if sector:
        query = query.eq("industry_group", sector)
    if role_family:
        query = query.eq("role_family", role_family)
    if career_band:
        query = query.eq("career_band", career_band)
    if location_city:
        query = query.eq("location_city", location_city)

    position = decode_cursor(cursor) if cursor else None
    if position:
        # True keyset pagination: strictly after (ingested_at, job_id) as a
        # pair. `ingested_at` is not unique — thousands of rows share an ingest
        # instant — so a `gte` on the timestamp plus a post-filter under-fills
        # every page whose cursor lands inside a batch. The first version did
        # exactly that and page two returned 1 row of a requested 5.
        stamp, last_id = position
        query = query.or_(
            f"ingested_at.gt.{stamp},"
            f"and(ingested_at.eq.{stamp},job_id.gt.{last_id})"
        )

    rows = (
        query.order("ingested_at", desc=False)
        .order("job_id", desc=False)
        .limit(limit + 1)
        .execute()
        .data
        or []
    )

    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = (
        encode_cursor(str(page[-1].get("ingested_at")), str(page[-1].get("job_id")))
        if page and has_more
        else None
    )
    return {
        "roles": [_row_to_role(r) for r in page],
        "count": len(page),
        "next_cursor": next_cursor,
    }


def record_delivery(partner_id: str, job_ids: list[str]) -> None:
    """Meter the roles this response handed over.

    Best-effort: a metering failure must never fail a delivery the caller has
    already been given. One statement, and the database deduplicates — a partial
    unique index on (partner, role, month) makes re-fetching a role the partner
    already received this month a no-op rather than a second charge.
    """
    if not job_ids:
        return
    try:
        # Through an RPC, not a PostgREST upsert. The unique index behind this
        # is PARTIAL (`metric = 'roles.delivered'`), and a partial index cannot
        # be inferred from an `on_conflict` column list — the upsert this
        # replaces raised an APIError on every single call while the feed
        # happily returned data, so the meter read zero and looked fine.
        get_supabase_admin().rpc(
            "record_roles_delivered",
            {"p_partner_id": partner_id, "p_job_ids": job_ids},
        ).execute()
    except Exception as exc:  # noqa: BLE001 — metering, never control flow
        logger.warning(
            "metric roles_feed.meter_failed partner=%s rows=%d reason=%s",
            partner_id,
            len(job_ids),
            type(exc).__name__,
        )
