"""Intent-gate liveness: verify the one listing a user is about to act on.

The background sweep drains the corpus on a staleness horizon. That is the wrong
instrument for the moment a user clicks Apply — a listing checked six days ago is
"within SLA" and still dead. This module jumps the queue for a single job_id and
returns a verdict the surface can render honestly.

Design notes:
  * Cheap by construction — one HTTP GET, only on real intent, cached ~6h. The
    volume is user-actions/day, not corpus size.
  * The verdict is written back through the same ``record()`` transition table
    the sweep uses, so an intent check also ages the queue and updates
    confidence. Verification is one truth, two triggers.
  * Never blocks the user on our own failure: a timeout/block degrades to
    ``unknown``, which the surface discloses rather than treating as dead.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
from supabase import Client

from app.repositories.job_listing_verification import ListingVerificationRepository
from app.services.job_listing_verifier import VerificationTarget, verify_listing

log = logging.getLogger(__name__)

# How long an intent-gate verdict stays good. Short enough that a user acting on
# a listing sees a near-live answer; long enough that repeated opens of the same
# card in one session cost one fetch.
FRESH_FOR = timedelta(hours=6)

_HTTP_TIMEOUT = httpx.Timeout(10.0)

# Verification result -> user-facing liveness state. Everything that is not a
# reached verdict lands on `unknown`: an ATS that rate-limits our verifier, or a
# malformed apply URL that could never have addressed the listing, is not
# evidence the job is gone, and claiming otherwise would be its own trust bug.
_STATE_BY_RESULT = {
    "seen_live": "live",
    "closed": "closed",
    "redirected": "unknown",
    "wrong_role": "unknown",
    "blocked": "unknown",
    "timeout": "unknown",
    "error": "unknown",
    "unroutable": "unknown",
    "source_failure": "unknown",
}

_STATE_BY_CONFIDENCE = {
    "active": "live",
    "closed": "closed",
    "likely_closed": "closed",
    "uncertain": "unverified",
}


@dataclass(frozen=True)
class LivenessVerdict:
    job_id: str
    state: str  # live | closed | unverified | unknown
    checked_at: str | None
    verified_live_at: str | None
    from_cache: bool


def _verdict_from_row(row: dict, *, from_cache: bool) -> LivenessVerdict:
    confidence = str(row.get("listing_confidence") or "uncertain")
    return LivenessVerdict(
        job_id=str(row.get("job_id") or ""),
        state=_STATE_BY_CONFIDENCE.get(confidence, "unverified"),
        checked_at=row.get("last_verification_attempt_at"),
        verified_live_at=row.get("last_verified_live_at"),
        from_cache=from_cache,
    )


def _is_fresh(row: dict, *, now: datetime) -> bool:
    """A prior check counts as fresh only if it actually reached a verdict.

    Freshness used to key off ``last_verification_attempt_at``, which is stamped
    on claim and on every attempt — including the ones that never concluded. So
    a listing the verifier could not read renewed its own stale confidence every
    six hours, indefinitely, and the failures were invisible because each one
    made the row look freshly checked. That is how job 509906 was served as
    verified-active through five consecutive `blocked` fetches, having last been
    seen live 45 days earlier.

    ``last_conclusive_verification_at`` is written only by the branches of
    ``record()`` that reach a verdict, so an unreachable or unreadable listing
    now falls through to a real re-check instead of a cached claim.
    """
    concluded = row.get("last_conclusive_verification_at")
    if not concluded:
        return False
    try:
        stamped = datetime.fromisoformat(str(concluded).replace("Z", "+00:00"))
    except ValueError:
        return False
    if stamped.tzinfo is None:
        stamped = stamped.replace(tzinfo=timezone.utc)
    return now - stamped < FRESH_FOR


async def check_liveness(
    db: Client,
    job_id: str,
    *,
    force: bool = False,
    client: httpx.AsyncClient | None = None,
) -> LivenessVerdict | None:
    """Return the liveness verdict for one listing, verifying live if stale.

    ``None`` when the job does not exist. Never raises for verification failure —
    an unreachable listing resolves to ``unknown``.
    """
    repo = ListingVerificationRepository(db)
    row = repo.snapshot(job_id)
    if row is None:
        return None
    if row.get("retired_at"):
        return LivenessVerdict(job_id, "closed", row.get("last_verification_attempt_at"),
                               row.get("last_verified_live_at"), from_cache=True)

    now = datetime.now(timezone.utc)
    if not force and _is_fresh(row, now=now):
        return _verdict_from_row(row, from_cache=True)

    apply_url = str(row.get("apply_url") or "")
    if not apply_url.startswith("http"):
        # Nothing to fetch (extension-imported rows often carry no apply URL).
        # Honest "unverified" beats a fabricated verdict.
        return _verdict_from_row(row, from_cache=True)

    target = VerificationTarget(
        job_id=str(row["job_id"]),
        apply_url=apply_url,
        job_title=str(row.get("job_title") or ""),
        current_confidence=str(row.get("listing_confidence") or "uncertain"),
    )
    # Stamp the attempt before the fetch so a crash mid-check still ages this row
    # in the queue — same ordering guarantee the claim RPC gives the sweep.
    repo.mark_attempted(job_id)

    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=_HTTP_TIMEOUT)
    try:
        result = await verify_listing(target, http)
    finally:
        if owns_client:
            await http.aclose()

    try:
        repo.record(result)
    except Exception:  # noqa: BLE001 — the verdict is still valid to return
        log.warning("metric job_liveness.record_failed job_id=%s", job_id, exc_info=True)

    log.info(
        "metric job_liveness.checked job_id=%s result=%s strength=%s provider=%s",
        job_id, result.result, result.strength, result.provider,
    )
    return LivenessVerdict(
        job_id=job_id,
        state=_STATE_BY_RESULT.get(result.result, "unknown"),
        checked_at=now.isoformat(),
        verified_live_at=now.isoformat() if result.result == "seen_live" else row.get("last_verified_live_at"),
        from_cache=False,
    )
