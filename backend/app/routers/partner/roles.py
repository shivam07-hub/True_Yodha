"""GET /partner/v1/roles — the recruiter live-role feed.

Live roles, each carrying the verification state that makes them worth paying
for. A sync feed rather than a search: the cursor walks forward, so a caller
polls with the cursor it was last given and receives only what has appeared
since.

Metered on distinct roles per month (MTR1's logic, not a new unit), so polling
often for freshness costs the same as polling rarely. Nothing is refused: there
is no plan and no quota, by decision.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.repositories.partners import PartnerCredential
from app.security.partner_auth import SCOPE_ROLES_READ, require_scope
from app.services import roles_feed

router = APIRouter()


@router.get("/roles")
def live_roles(
    cursor: str | None = Query(
        default=None,
        description="Opaque cursor from a previous response's `next_cursor`. Omit to start at the oldest live role.",
    ),
    limit: int = Query(default=roles_feed.DEFAULT_LIMIT, ge=1, le=roles_feed.MAX_LIMIT),
    sector: str | None = Query(default=None, description="Exact sector, e.g. 'BFSI'."),
    role_family: str | None = Query(default=None),
    career_band: str | None = Query(default=None),
    location_city: str | None = Query(default=None),
    partner: PartnerCredential = Depends(require_scope(SCOPE_ROLES_READ)),
) -> dict[str, Any]:
    """One page of live, source-verified roles.

    `next_cursor` is null when you have reached the end of the feed. Keep the
    last cursor and poll with it: the walk is forward-only, so a role that
    appears between two polls is delivered on the next one rather than sliding
    underneath the window.

    Every row carries `verification.state` and `verification.last_verified_live_at`.
    Those are our own conclusive check at the employer's source, which is the
    reason this is not a scrape — see the Ghost Job Index for what happens to
    feeds that cannot tell.
    """
    page = roles_feed.fetch_roles(
        cursor=cursor,
        limit=limit,
        sector=sector,
        role_family=role_family,
        career_band=career_band,
        location_city=location_city,
    )
    # After the page is assembled, never before: the meter records what was
    # actually handed over.
    roles_feed.record_delivery(
        partner.partner_id, [str(r["job_id"]) for r in page["roles"] if r.get("job_id")]
    )
    return page
