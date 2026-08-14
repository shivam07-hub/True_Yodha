from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any, TypeVar

from postgrest.exceptions import APIError
from supabase import Client

from app.services.job_listing_verifier import (
    VerificationResult,
    VerificationTarget,
)

log = logging.getLogger(__name__)

_T = TypeVar("_T")

# Supabase's edge/data-api layer intermittently 500s (Cloudflare "1101 Worker
# threw exception" — an HTML body, not a PostgREST JSON error), unrelated to
# query content. A single blip must not crash this best-effort cron sweep. Retry
# only genuinely transient failures (5xx / dropped transport); re-raise 4xx so
# real bugs (bad column, RLS, malformed filter) still surface loudly.
_TRANSIENT_STATUS = {"500", "502", "503", "504"}

# Consecutive unreachable checks before a stored `active` degrades to
# `uncertain`. One blocked fetch is noise — an ATS rate-limiting our verifier
# says nothing about the job. A run of them means we have no current basis for
# the claim, so we stop making it. `uncertain` is "we don't know", never "dead":
# nothing is quarantined or retired, and one `seen_live` restores it.
DEGRADE_AFTER_FAILURES = 2


def _is_transient(err: Exception) -> bool:
    if isinstance(err, APIError):
        code = str(getattr(err, "code", "") or "")
        message = str(getattr(err, "message", "") or "")
        return code in _TRANSIENT_STATUS or "Worker threw exception" in message
    # httpcore / httpx transport failures (idle-drop, server disconnect) surface
    # by name across versions; match defensively without a hard import.
    return type(err).__name__ in {
        "RemoteProtocolError",
        "ConnectError",
        "ReadError",
        "WriteError",
        "PoolTimeout",
        "ConnectTimeout",
        "ReadTimeout",
    }


def _with_retry(build: Callable[[], _T], *, attempts: int = 3, base_delay: float = 0.75) -> _T:
    """Execute a Supabase call, retrying transient upstream failures with backoff.

    ``build`` must construct AND execute the query on each call — a consumed
    PostgREST builder cannot be re-executed, so the whole chain is rebuilt per
    attempt.
    """
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return build()
        except Exception as err:  # noqa: BLE001 — classified immediately below
            if not _is_transient(err) or attempt == attempts - 1:
                raise
            last = err
            log.warning(
                "metric job_verifier.retry attempt=%d/%d err=%s",
                attempt + 1, attempts, err,
            )
            time.sleep(base_delay * (2 ** attempt))
    raise last  # pragma: no cover — loop always returns or raises


class ListingVerificationRepository:
    """Service-role adapter for verifier targets, evidence, and transitions."""

    def __init__(
        self,
        db: Client,
        *,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self.db = db
        self.now = now

    def claim_targets(
        self,
        *,
        limit: int = 200,
        stale_days: int = 7,
        priority_stale_hours: int = 24,
    ) -> list[VerificationTarget]:
        """Atomically claim due listings, prioritising durable user relevance.

        The claim RPC stamps the narrow verification schedule in the same
        statement that selects (FOR UPDATE SKIP LOCKED), so a row is served to
        exactly one worker and a crashed sweep cannot re-serve the same batch.
        The wide jobs row is updated once, when the verifier has evidence.
        Up to 80% of a claim is reserved for tracked, recently shown, or matched
        jobs. The rest preserves oldest-first corpus progress. Confidence remains
        irrelevant: a row previously marked ``active`` re-enters once stale.
        """
        capped = max(1, min(limit, 1000))
        rows = _with_retry(
            lambda: self.db.rpc(
                "claim_verify_targets",
                {
                    "p_limit": capped,
                    "p_stale": f"{max(0, stale_days)} days",
                    "p_priority_stale": f"{max(1, priority_stale_hours)} hours",
                },
            ).execute()
        ).data or []
        return [
            VerificationTarget(
                job_id=str(row["job_id"]),
                apply_url=str(row["apply_url"]),
                job_title=str(row.get("job_title") or ""),
                current_confidence=str(row.get("listing_confidence") or "uncertain"),
                verification_priority=str(row.get("verification_priority") or "corpus"),
            )
            for row in rows
            if row.get("job_id") and row.get("apply_url")
        ]

    def snapshot(self, job_id: str) -> dict[str, Any] | None:
        """Current verification state of one listing — the intent-gate read.

        Keyed by job_id rather than claimed from the queue: an on-intent check
        jumps the queue for the one listing a user is about to act on.
        """
        rows = _with_retry(
            lambda: self.db.table("jobs")
            .select(
                "job_id,job_title,apply_url,listing_confidence,"
                "last_verified_live_at,last_verification_attempt_at,retired_at,"
                "last_conclusive_verification_at"
            )
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        ).data or []
        return rows[0] if rows else None

    def mark_attempted(self, job_id: str) -> None:
        """Stamp an out-of-band (intent-gate) check so it also ages the queue."""
        _with_retry(
            lambda: self.db.table("jobs")
            .update({"last_verification_attempt_at": self.now().isoformat()})
            .eq("job_id", job_id)
            .execute()
        )

    def _failure_state(self, job_id: str) -> tuple[int, str]:
        """Current failure run and stored confidence for one listing.

        Read only on the unreachable path — the common verdicts write a flat
        reset and need no round trip.
        """
        rows = _with_retry(
            lambda: self.db.table("jobs")
            .select("consecutive_verify_failures,listing_confidence")
            .eq("job_id", job_id)
            .limit(1)
            .execute()
        ).data or []
        if not rows:
            return 0, "uncertain"
        row = rows[0]
        try:
            failures = int(row.get("consecutive_verify_failures") or 0)
        except (TypeError, ValueError):
            failures = 0
        return max(0, failures), str(row.get("listing_confidence") or "uncertain")

    def record(self, result: VerificationResult) -> None:
        now = self.now()
        timestamp = now.isoformat()
        evidence: dict[str, Any] = {
            **result.evidence,
            "provider": result.provider,
            "status_code": result.status_code,
            "final_url": result.final_url,
        }
        _with_retry(
            lambda: self.db.table("job_listing_observations").insert(
                {
                    "job_id": result.job_id,
                    "observer": "verifier",
                    "result": result.result,
                    "strength": result.strength,
                    "observed_at": timestamp,
                    "evidence": evidence,
                    "verifier_version": "provider_http_v1",
                }
            ).execute()
        )

        update: dict[str, Any] = {
            "last_verification_attempt_at": timestamp,
            "lifecycle_updated_at": timestamp,
        }
        # Every branch below that reaches a verdict stamps the conclusive clock
        # and clears the failure run. The two branches that do NOT — unreachable
        # and unreadable — deliberately leave it alone, so a listing we cannot
        # check stops passing as freshly checked.
        conclusive = {
            "last_conclusive_verification_at": timestamp,
            "consecutive_verify_failures": 0,
        }
        if result.result == "seen_live":
            update.update(conclusive)
            update.update(
                {
                    "is_active": True,
                    "listing_confidence": "active",
                    "last_verified_live_at": timestamp,
                    "consecutive_complete_misses": 0,
                    "confidence_reason": f"{result.provider}_verifier_live",
                    "quarantined_at": None,
                    "quarantine_until": None,
                    "deletion_eligible_at": None,
                    "retired_at": None,
                    "reactivated_at": timestamp,
                }
            )
        elif result.result == "closed" and result.strength == "strong":
            update.update(conclusive)
            eligible_at = (now + timedelta(days=30)).isoformat()
            update.update(
                {
                    "is_active": False,
                    "listing_confidence": "closed",
                    "confidence_reason": f"{result.provider}_verifier_closed",
                    "quarantined_at": timestamp,
                    "quarantine_until": eligible_at,
                    "deletion_eligible_at": eligible_at,
                    "retired_at": timestamp,
                }
            )
        elif result.result == "closed":
            update.update(conclusive)
            update.update(
                {
                    "listing_confidence": "likely_closed",
                    "confidence_reason": f"{result.provider}_verifier_unconfirmed_closed",
                }
            )
        elif result.result in {"redirected", "wrong_role"}:
            update.update(conclusive)
            update.update(
                {
                    "listing_confidence": "uncertain",
                    "confidence_reason": f"{result.provider}_verifier_{result.result}",
                }
            )
        elif result.result in {"blocked", "timeout"}:
            # We could not reach the listing. That is not evidence it is gone —
            # but it is also not permission to keep asserting the old verdict.
            # Previously this branch did not exist: the row kept `active` AND
            # re-stamped its attempt clock, which renewed the intent-gate cache
            # for another 6h. Five of these in a row is how a listing last seen
            # live in June was served as verified-active in August.
            state = self._failure_state(result.job_id)
            failures = state[0] + 1
            update["consecutive_verify_failures"] = failures
            if failures >= DEGRADE_AFTER_FAILURES and state[1] == "active":
                update["listing_confidence"] = "uncertain"
                update["confidence_reason"] = (
                    f"{result.provider}_verifier_unreachable_x{failures}"
                )
        # `error`, `unroutable` and `source_failure` are the remaining cases and
        # are deliberately inert. `error` is almost entirely
        # `page_loaded_without_role_evidence`: an HTTP 200 on a client-rendered
        # ATS whose HTML our fetch cannot read. `unroutable` is an apply URL that
        # could never have addressed the listing, so its status code describes our
        # data defect, not the job. `source_failure` is a closure the sweep's
        # closure-share guard withheld because one host closed nearly everything
        # at once. None of the three says anything about this listing, so none may
        # degrade it or count as a check — leaving the conclusive clock untouched
        # is what stops them renewing a stale claim.
        _with_retry(
            lambda: self.db.table("jobs")
            .update(update)
            .eq("job_id", result.job_id)
            .execute()
        )

    def retire_eligible(self, *, limit: int = 500) -> int:
        capped = max(1, min(limit, 5000))
        result = _with_retry(
            lambda: self.db.rpc("retire_closed_jobs", {"p_limit": capped}).execute()
        )
        return len(result.data or [])
