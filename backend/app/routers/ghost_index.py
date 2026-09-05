"""The Ghost Job Index — public read.

The index answers one question about named employers: when the employer's own
ATS has stopped serving a role, is the employer's own feed still advertising it?

Tier 0 by construction. The whole answer is precomputed into
`ghost_index_snapshot` by `refresh_ghost_index()`, and this endpoint is one RPC
over 636 rows — measured at 5.0ms as `anon`, index scan, all buffer hits. No
aggregation happens per request, and nothing here reads user data: the index is
a public aggregate over public job listings.

`ghost_index_payload()` assembles the response in SQL rather than four
PostgREST reads. Two reasons, both scars: this path costs ~165ms per round
trip, and PostgREST's 1000-row ceiling truncates SILENTLY — an index that
quietly loses its tail is worse than one that is late.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.database import get_supabase
from app.services import shared_cache

router = APIRouter(prefix="/public/ghost-index", tags=["public"])
log = logging.getLogger(__name__)

# The snapshot moves only when the refresh runs. A long TTL with a longer stale
# window means a reader never waits on a rebuild, and the figure they see is
# the one the refresh published rather than a half-written one.
_CACHE_TTL_SECONDS = 900
_CACHE_STALE_SECONDS = 86_400


def _load_index() -> dict[str, Any]:
    payload = get_supabase().rpc("ghost_index_payload", {}).execute().data
    if not payload or not payload.get("overall"):
        # Absent, not empty. The snapshot has never been computed, or the
        # refresh failed before writing the overall row — either way the honest
        # answer is that we have no index to show, not a page of zeroes.
        raise LookupError("ghost index snapshot is not populated")
    return payload


@router.get("")
def get_ghost_index(response: Response) -> dict[str, Any]:
    """The whole index: corpus state, monthly cohorts, companies, sectors.

    Every rate ships beside the count it was taken over, and the `coverage`
    block states what is NOT published — how many employers cleared the minimum
    cell against how many are in the corpus at all. A reader must be able to see
    the limits of the index without leaving the response.
    """
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
    try:
        return shared_cache.get_or_compute(
            "ghost_index_public",
            _load_index,
            ttl_seconds=_CACHE_TTL_SECONDS,
            stale_seconds=_CACHE_STALE_SECONDS,
        )
    except LookupError:
        # The error boundary rewrites every 5xx detail to a generic line, so
        # this string never reaches a client — the STATUS is the contract, and
        # the detail is here for the log. 503 rather than an empty 200: a page
        # of zeroes would read as "no employer leaves ads up", the opposite of
        # what we know.
        log.warning("metric ghost_index.snapshot_missing")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Ghost Job Index has not been computed yet.",
        ) from None
