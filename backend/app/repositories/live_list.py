"""A page of live listings.

The feed's role list, the companies list, and internships were three copies of
"open jobs, then stop." Each one scanned when the planner could not see the
live predicate on its own. Callers pass a scope. The database stops at the page.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.services.listing_liveness import live_only

_FAMILIES = "live_jobs_for_families"
_FAMILY_CAP = 1000

_INTERN_OR = (
    "employment_kind.eq.internship,"
    "seniority_level.eq.intern,"
    "listing_venue.eq.myro"
)
_INTERN_SELECT = (
    "job_id, job_title, company_name, job_description, industry, apply_url, "
    "location, location_city, location_country, location_mode, locations, "
    "role_family, seniority_level, min_years_experience, max_years_experience, "
    "main_skills, listing_venue, employment_kind, stipend_low_inr, stipend_high_inr, "
    "duration_months, ppo, first_seen, is_active, listing_confidence, "
    "last_verified_live_at, last_conclusive_verification_at, reactivated_at"
)


def _clean(values: list[str] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in values or []:
        text = (raw or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def jobs_for_families(
    db: Client,
    families: list[str],
    *,
    countries: list[str] | None = None,
    require_fresh: bool = True,
    limit: int = 400,
) -> list[str]:
    """Live job ids in these role families, newest verified first.

    Country uses the same rule as the skill pool: the named country, or a
    remote/hybrid row with no country. The filter is in the page, so a full
    page comes back instead of a page that then shrinks.
    """
    wanted = _clean(families)
    if not wanted or not require_fresh:
        if not wanted:
            return []
        return _families_without_the_live_index(db, wanted, countries=countries, limit=limit)
    page = max(1, min(int(limit), _FAMILY_CAP))
    rows = (
        db.rpc(
            _FAMILIES,
            {
                "p_families": wanted,
                "p_countries": [c.lower() for c in _clean(countries)],
                "p_limit": page,
            },
        ).execute()
        .data
        or []
    )
    return [str(row["job_id"]) for row in rows if row.get("job_id")]


def _families_without_the_live_index(
    db: Client,
    families: list[str],
    *,
    countries: list[str] | None,
    limit: int,
) -> list[str]:
    """require_fresh is false. Not the feed. The live index must not hide rows."""
    rows = (
        db.table("jobs")
        .select("job_id")
        .in_("role_family", families)
        .order("last_verified_live_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []
    ids = [str(row["job_id"]) for row in rows if row.get("job_id")]
    if not countries:
        return ids
    allowed = {c.lower() for c in _clean(countries)}
    kept: list[str] = []
    for i in range(0, len(ids), 200):
        chunk = ids[i:i + 200]
        located = (
            db.table("jobs")
            .select("job_id, location_country, location_mode")
            .in_("job_id", chunk)
            .execute()
        ).data or []
        for row in located:
            country = (row.get("location_country") or "").strip().lower()
            mode = (row.get("location_mode") or "").strip().lower()
            if (country and country in allowed) or (not country and mode in ("remote", "hybrid")):
                kept.append(str(row["job_id"]))
    return kept


def internship_rows(db: Any, *, venue: str | None, limit: int = 60) -> list[dict[str, Any]]:
    """Open internships, newest discovered first. Tagged rows only."""
    query = live_only(db.table("jobs").select(_INTERN_SELECT)).limit(limit)
    if venue == "myro":
        query = query.eq("listing_venue", "myro")
    else:
        query = query.or_(_INTERN_OR)
    return query.order("first_seen", desc=True).execute().data or []


def top_companies(
    db: Client,
    *,
    kind: str,
    value: str,
    limit: int,
    sort: str,
) -> list[dict[str, Any]]:
    """Counted companies in one city or one industry. The caller does not group."""
    return (
        db.rpc(
            "top_companies_at",
            {"p_kind": kind, "p_value": value, "p_limit": limit, "p_sort": sort},
        ).execute()
        .data
        or []
    )
