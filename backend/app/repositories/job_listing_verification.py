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

        The claim RPC stamps ``last_verification_attempt_at`` in the same
        statement that selects (FOR UPDATE SKIP LOCKED), so a row is served to
        exactly one worker and a crashed sweep cannot re-serve the same batch.
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
                "last_verified_live_at,last_verification_attempt_at,retired_at"
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
        if result.result == "seen_live":
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
            update.update(
                {
                    "listing_confidence": "likely_closed",
                    "confidence_reason": f"{result.provider}_verifier_unconfirmed_closed",
                }
            )
        elif result.result in {"redirected", "wrong_role"}:
            update.update(
                {
                    "listing_confidence": "uncertain",
                    "confidence_reason": f"{result.provider}_verifier_{result.result}",
                }
            )
        _with_retry(
            lambda: self.db.table("jobs")
            .update(update)
            .eq("job_id", result.job_id)
            .execute()
        )

    def pending_count(self, *, stale_days: int = 7) -> int:
        """Count of listings past their staleness horizon — the drain-belt signal.

        Served by idx_jobs_verify_due. Goes through the RPC rather than a
        PostgREST filter chain because ``apply_url=like.http%`` puts a bare ``%``
        in the query string, which the Supabase edge rejects with an HTML 500.
        """
        res = _with_retry(
            lambda: self.db.rpc(
                "count_verify_due", {"p_stale": f"{max(0, stale_days)} days"}
            ).execute()
        )
        return int(res.data or 0)

    def priority_pending_count(self, *, stale_hours: int = 24) -> int:
        """User-relevant listings past their tighter freshness horizon."""
        res = _with_retry(
            lambda: self.db.rpc(
                "count_priority_verify_due",
                {"p_stale": f"{max(1, stale_hours)} hours"},
            ).execute()
        )
        return int(res.data or 0)

    def retire_eligible(self, *, limit: int = 500) -> int:
        capped = max(1, min(limit, 5000))
        result = _with_retry(
            lambda: self.db.rpc("retire_closed_jobs", {"p_limit": capped}).execute()
        )
        return len(result.data or [])
