"""partner_delivery — webhook endpoints, the delivery log, and the job ledger.

Split from `partners.py` on the identity/delivery seam: that module answers "who
is calling and who is this user", this one answers "what have we sent them and
did it arrive".

The job ledger (`partner_job_deliveries`) is a ledger and not a "since T" window
on purpose. A timestamp window re-sends the moment a clock, a backfill or a retry
disagrees with it, and the partner's user gets the same opening a second time.
A row per (seat, job) cannot repeat itself.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)

# Delivery retry ladder. Mirrors the shape of the RQ ladder in
# services/background/dispatch.py but lives in the DB, because a partner endpoint
# can be down for hours — far longer than a worker is willing to hold a job.
RETRY_INTERVALS_SECONDS = (60, 300, 1800, 7200, 21600)
MAX_ATTEMPTS = len(RETRY_INTERVALS_SECONDS) + 1

# Consecutive failures after which an endpoint is paused. A partner who has moved
# their URL should not cost us an unbounded retry stream forever.
PAUSE_AFTER_CONSECUTIVE_FAILURES = 20


class PartnerDeliveryRepository:
    """Webhook config + delivery log + per-seat job ledger. Admin client only."""

    def __init__(self, admin_db: Client) -> None:
        self._db = admin_db

    # ── endpoint config ─────────────────────────────────────────────────────

    def get_webhook(self, partner_id: str) -> dict[str, Any] | None:
        resp = (
            self._db.table("partner_webhooks")
            .select("*")
            .eq("partner_id", partner_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return rows[0] if rows else None

    def upsert_webhook(
        self,
        *,
        partner_id: str,
        url: str,
        signing_secret: str,
        event_types: list[str],
    ) -> dict[str, Any]:
        """Register or replace the endpoint. Registering resets the failure count
        and un-pauses: the partner is telling us this URL is good now."""
        payload = {
            "partner_id": partner_id,
            "url": url,
            "signing_secret": signing_secret,
            "event_types": event_types,
            "status": "active",
            "consecutive_failures": 0,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = (
            self._db.table("partner_webhooks")
            .upsert(payload, on_conflict="partner_id")
            .execute()
        )
        return (resp.data or [{}])[0]

    def pause_webhook(self, partner_id: str) -> None:
        self._db.table("partner_webhooks").update({
            "status": "paused",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("partner_id", partner_id).execute()

    # ── delivery log ────────────────────────────────────────────────────────

    def create_delivery(
        self,
        *,
        event_id: str,
        partner_id: str,
        event_type: str,
        url: str,
        payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Record the intent to deliver. Returns None when `event_id` already
        exists — the caller is a retry of an enqueue, not a new event."""
        try:
            resp = self._db.table("partner_webhook_deliveries").insert({
                "event_id": event_id,
                "partner_id": partner_id,
                "event_type": event_type,
                "url": url,
                "payload": payload,
                "next_attempt_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as exc:  # noqa: BLE001 — unique violation is the expected dedupe
            logger.info("partner delivery already recorded event=%s (%s)", event_id, exc.__class__.__name__)
            return None
        return (resp.data or [{}])[0]

    def mark_delivered(self, delivery_id: str, *, attempts: int, response_code: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self._db.table("partner_webhook_deliveries").update({
            "status": "delivered",
            "attempts": attempts,
            "response_code": response_code,
            "error": None,
            "next_attempt_at": None,
            "delivered_at": now,
        }).eq("id", delivery_id).execute()

    def mark_attempt_failed(
        self,
        delivery_id: str,
        *,
        attempts: int,
        response_code: int | None,
        error: str,
    ) -> bool:
        """Record a failed attempt. Returns True when another attempt is due,
        False when the ladder is exhausted and the delivery is terminal."""
        if attempts >= MAX_ATTEMPTS:
            self._db.table("partner_webhook_deliveries").update({
                "status": "failed",
                "attempts": attempts,
                "response_code": response_code,
                "error": error[:500],
                "next_attempt_at": None,
            }).eq("id", delivery_id).execute()
            return False
        delay = RETRY_INTERVALS_SECONDS[min(attempts - 1, len(RETRY_INTERVALS_SECONDS) - 1)]
        next_at = datetime.now(timezone.utc) + timedelta(seconds=delay)
        self._db.table("partner_webhook_deliveries").update({
            "status": "pending",
            "attempts": attempts,
            "response_code": response_code,
            "error": error[:500],
            "next_attempt_at": next_at.isoformat(),
        }).eq("id", delivery_id).execute()
        return True

    def due_deliveries(self, *, limit: int = 100) -> list[dict[str, Any]]:
        """Pending deliveries whose next attempt is due — the sweeper's work list."""
        resp = (
            self._db.table("partner_webhook_deliveries")
            .select("id, event_id, partner_id, event_type, url, payload, attempts")
            .eq("status", "pending")
            .lte("next_attempt_at", datetime.now(timezone.utc).isoformat())
            .order("next_attempt_at")
            .limit(limit)
            .execute()
        )
        return resp.data or []

    def recent_deliveries(self, partner_id: str, *, limit: int = 20) -> list[dict[str, Any]]:
        """The partner's own view of what we sent — integration debugging without
        asking us to read logs for them."""
        resp = (
            self._db.table("partner_webhook_deliveries")
            .select("event_id, event_type, status, attempts, response_code, error, created_at, delivered_at")
            .eq("partner_id", partner_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return resp.data or []

    def record_outcome(self, partner_id: str, *, delivered: bool) -> None:
        """Roll the endpoint's health forward; pause an endpoint that keeps failing."""
        webhook = self.get_webhook(partner_id)
        if not webhook:
            return
        now = datetime.now(timezone.utc).isoformat()
        if delivered:
            self._db.table("partner_webhooks").update({
                "consecutive_failures": 0,
                "last_delivery_at": now,
                "updated_at": now,
            }).eq("partner_id", partner_id).execute()
            return
        failures = int(webhook.get("consecutive_failures") or 0) + 1
        update: dict[str, Any] = {"consecutive_failures": failures, "updated_at": now}
        if failures >= PAUSE_AFTER_CONSECUTIVE_FAILURES:
            update["status"] = "paused"
            logger.warning(
                "metric partner_webhook.paused partner=%s consecutive_failures=%d",
                partner_id, failures,
            )
        self._db.table("partner_webhooks").update(update).eq("partner_id", partner_id).execute()

    # ── job ledger ──────────────────────────────────────────────────────────

    def delivered_job_ids(self, partner_user_id: str, *, limit: int = 2000) -> set[str]:
        resp = (
            self._db.table("partner_job_deliveries")
            .select("job_id")
            .eq("partner_user_id", partner_user_id)
            .order("delivered_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {str(r["job_id"]) for r in (resp.data or []) if r.get("job_id")}

    def record_delivered_jobs(self, partner_user_id: str, job_ids: list[str]) -> None:
        if not job_ids:
            return
        self._db.table("partner_job_deliveries").upsert(
            [{"partner_user_id": partner_user_id, "job_id": jid} for jid in job_ids],
            on_conflict="partner_user_id,job_id",
        ).execute()
