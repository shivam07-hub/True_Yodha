"""The sector hiring panel — what is actually hiring, by sector.

Wave 2's first slice. Built for recruiters, EdTech and HR tech, and readable by
a jobseeker, which is why it is public rather than authed.

Tier 0: `refresh_sector_panel()` precomputes the whole thing into eight rows and
this endpoint is one RPC over them. Nothing aggregates per request, and nothing
here reads user data — it is a public aggregate over public job listings.

The panel carries one figure nobody else can publish: the share of a sector's
closed roles still sitting in the employer's own feed, cross-referenced from the
Ghost Job Index. The panel says what is open; the index says whether to believe
it. Where the index withheld a sector for its own minimum cell, that figure is
null here rather than quietly recomputed by a looser rule.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.database import get_supabase
from app.services import shared_cache

router = APIRouter(prefix="/public/hiring-panel", tags=["public"])
log = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 900
_CACHE_STALE_SECONDS = 86_400


def _load_panel() -> dict[str, Any]:
    payload = get_supabase().rpc("sector_panel_payload", {}).execute().data
    if not payload or not payload.get("sectors"):
        raise LookupError("sector panel snapshot is not populated")
    return payload


@router.get("")
def get_hiring_panel(response: Response) -> dict[str, Any]:
    """Every published sector, largest live pool first.

    The `coverage` block states what is NOT here: sectors below the minimum cell
    are absent by construction, so without it a reader would take the list for
    the whole market.
    """
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
    try:
        return shared_cache.get_or_compute(
            "sector_panel_public",
            _load_panel,
            ttl_seconds=_CACHE_TTL_SECONDS,
            stale_seconds=_CACHE_STALE_SECONDS,
        )
    except LookupError:
        # Absent, not empty. An empty panel would read as "nothing is hiring".
        log.warning("metric sector_panel.snapshot_missing")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The hiring panel has not been computed yet.",
        ) from None
