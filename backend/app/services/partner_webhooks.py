"""partner_webhooks — sign, send, and retry the events we push to a partner.

Delivery contract (documented in PARTNER_API.md):

    POST <partner url>
    X-Myro-Event: job_matches.new
    X-Myro-Event-Id: evt_<hex>          idempotency key — dedupe on this
    X-Myro-Delivery-Attempt: 1
    X-Myro-Signature: t=<unix>,v1=<hex hmac-sha256 of "<t>.<raw body>">

ONE retry ladder, and it lives in the database (`partner_delivery`), not in RQ.
A partner endpoint can be down for hours; RQ's ladder tops out in minutes and
holds a worker slot while it waits. So the enqueued job makes exactly one
attempt, records the outcome, and returns normally — the sweeper re-enqueues
whatever is due. Two ladders would each retry the other's retries.

The endpoint url is attacker-adjacent input: a partner could point it at our own
private network. `validate_url` is the gate, and it runs at registration time so
a bad url is a 422 to the partner rather than a surprise request from our VPC.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import socket
import time
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import requests

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.partner_delivery import PartnerDeliveryRepository
from app.services import background

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10
_JOB_TYPE = "partner_webhook_deliver"

EVENT_JOB_MATCHES = "job_matches.new"
EVENT_PING = "ping"
KNOWN_EVENTS = (EVENT_JOB_MATCHES, EVENT_PING)


class InvalidWebhookUrl(ValueError):
    """The url cannot be registered — wrong scheme, unresolvable, or internal."""


def generate_signing_secret() -> str:
    return f"whsec_{secrets.token_hex(32)}"


def validate_url(url: str) -> str:
    """Return the url if we are willing to POST to it, else raise.

    https only, public addresses only. Every resolved address must be public:
    a hostname with one public and one loopback answer is a classic DNS-rebind
    setup, and accepting it would let a partner aim our own network at itself.
    """
    parsed = urlsplit((url or "").strip())
    if parsed.scheme != "https" or not parsed.hostname:
        raise InvalidWebhookUrl("Webhook url must be an absolute https:// url.")
    if not settings.is_production and parsed.hostname in {"localhost", "127.0.0.1"}:
        return url.strip()  # local integration testing only
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise InvalidWebhookUrl("Webhook host does not resolve.") from exc
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            raise InvalidWebhookUrl("Webhook host must be a public address.")
    return url.strip()


def sign(secret: str, *, timestamp: int, body: str) -> str:
    digest = hmac.new(
        secret.encode("utf-8"), f"{timestamp}.{body}".encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def enqueue_event(
    *, partner_id: str, event_type: str, payload: dict[str, Any]
) -> str | None:
    """Record an event and hand it to the queue. Returns the event id, or None
    when the partner has no active endpoint (not an error — a partner may be
    pull-only)."""
    admin = get_supabase_admin()
    repo = PartnerDeliveryRepository(admin)
    webhook = repo.get_webhook(partner_id)
    if not webhook or webhook.get("status") != "active":
        return None
    if event_type not in (webhook.get("event_types") or []):
        return None

    event_id = f"evt_{uuid4().hex}"
    body = {"id": event_id, "type": event_type, "created_at": _now_iso(), **payload}
    delivery = repo.create_delivery(
        event_id=event_id,
        partner_id=partner_id,
        event_type=event_type,
        url=str(webhook["url"]),
        payload=body,
    )
    if not delivery:
        return None
    background.enqueue(
        background.LANE_BULK,
        _JOB_TYPE,
        payload={"delivery_id": str(delivery["id"])},
        correlation_id=f"partner_webhook:{event_id}",
    )
    return event_id


def attempt_delivery(delivery: dict[str, Any]) -> bool:
    """One HTTP attempt. Records the outcome and never raises."""
    admin = get_supabase_admin()
    repo = PartnerDeliveryRepository(admin)
    partner_id = str(delivery["partner_id"])
    webhook = repo.get_webhook(partner_id)
    if not webhook:
        repo.mark_attempt_failed(
            str(delivery["id"]),
            attempts=int(delivery.get("attempts") or 0) + 1,
            response_code=None,
            error="No webhook endpoint registered.",
        )
        return False

    attempts = int(delivery.get("attempts") or 0) + 1
    body = json.dumps(delivery["payload"], separators=(",", ":"), sort_keys=True)
    timestamp = int(time.time())
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Myro-Webhooks/1",
        "X-Myro-Event": str(delivery["event_type"]),
        "X-Myro-Event-Id": str(delivery["event_id"]),
        "X-Myro-Delivery-Attempt": str(attempts),
        "X-Myro-Signature": sign(str(webhook["signing_secret"]), timestamp=timestamp, body=body),
    }
    try:
        response = requests.post(
            str(webhook["url"]),
            data=body.encode("utf-8"),
            headers=headers,
            timeout=_TIMEOUT_SECONDS,
            # A redirect would re-send a signed body to a host we never validated.
            allow_redirects=False,
        )
    except requests.RequestException as exc:
        repo.mark_attempt_failed(
            str(delivery["id"]), attempts=attempts, response_code=None, error=str(exc)
        )
        repo.record_outcome(partner_id, delivered=False)
        logger.warning(
            "metric partner_webhook.attempt_failed event=%s attempt=%d reason=%s",
            delivery["event_id"], attempts, type(exc).__name__,
        )
        return False

    if 200 <= response.status_code < 300:
        repo.mark_delivered(
            str(delivery["id"]), attempts=attempts, response_code=response.status_code
        )
        repo.record_outcome(partner_id, delivered=True)
        logger.info(
            "metric partner_webhook.delivered event=%s attempt=%d status=%d",
            delivery["event_id"], attempts, response.status_code,
        )
        return True

    repo.mark_attempt_failed(
        str(delivery["id"]),
        attempts=attempts,
        response_code=response.status_code,
        error=(response.text or "")[:500],
    )
    repo.record_outcome(partner_id, delivered=False)
    logger.warning(
        "metric partner_webhook.attempt_failed event=%s attempt=%d status=%d",
        delivery["event_id"], attempts, response.status_code,
    )
    return False


def sweep_due(*, limit: int = 100) -> dict[str, int]:
    """Re-enqueue every delivery whose next attempt has come due.

    This is the whole retry engine. Run it on a schedule; running it twice
    concurrently is harmless because the enqueue is keyed on the event id.
    """
    repo = PartnerDeliveryRepository(get_supabase_admin())
    due = repo.due_deliveries(limit=limit)
    for row in due:
        background.enqueue(
            background.LANE_BULK,
            _JOB_TYPE,
            payload={"delivery_id": str(row["id"])},
            correlation_id=f"partner_webhook:{row['event_id']}:{row.get('attempts') or 0}",
        )
    if due:
        logger.info("metric partner_webhook.sweep requeued=%d", len(due))
    return {"requeued": len(due)}


@background.handler(_JOB_TYPE)
async def _deliver_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Exactly one attempt per run. Returns normally on failure ON PURPOSE — the
    DB ladder owns retries, so raising here would stack RQ's ladder on top."""
    delivery_id = str(payload.get("delivery_id") or "")
    if not delivery_id:
        return
    admin = get_supabase_admin()
    resp = (
        admin.table("partner_webhook_deliveries")
        .select("id, event_id, partner_id, event_type, url, payload, attempts, status")
        .eq("id", delivery_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows or rows[0].get("status") != "pending":
        return
    attempt_delivery(rows[0])


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
