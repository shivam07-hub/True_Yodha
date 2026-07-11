from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

from app.services.job_listing_verifier import (
    VerificationResult,
    VerificationTarget,
)


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

    def targets(self, *, limit: int = 200) -> list[VerificationTarget]:
        rows = (
            self.db.table("jobs")
            .select("job_id,job_title,apply_url,listing_confidence")
            .in_("listing_confidence", ["uncertain", "likely_closed"])
            .like("apply_url", "http%")
            .order("last_verification_attempt_at", desc=False)
            .limit(max(1, min(limit, 1000)))
            .execute()
        ).data or []
        return [
            VerificationTarget(
                job_id=str(row["job_id"]),
                apply_url=str(row["apply_url"]),
                job_title=str(row.get("job_title") or ""),
                current_confidence=str(row.get("listing_confidence") or "uncertain"),
            )
            for row in rows
            if row.get("job_id") and row.get("apply_url")
        ]

    def record(self, result: VerificationResult) -> None:
        now = self.now()
        timestamp = now.isoformat()
        evidence: dict[str, Any] = {
            **result.evidence,
            "provider": result.provider,
            "status_code": result.status_code,
            "final_url": result.final_url,
        }
        self.db.table("job_listing_observations").insert(
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
        self.db.table("jobs").update(update).eq("job_id", result.job_id).execute()

    def retire_eligible(self, *, limit: int = 500) -> int:
        result = self.db.rpc(
            "retire_closed_jobs", {"p_limit": max(1, min(limit, 5000))}
        ).execute()
        return len(result.data or [])
