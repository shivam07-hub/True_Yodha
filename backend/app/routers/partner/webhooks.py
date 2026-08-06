"""Partner-managed webhook endpoint: register, inspect, test.

Self-serve on purpose. An integration where the partner has to email us to change
a url, or to find out whether a delivery landed, is an integration we end up
operating for them.

The signing secret is returned exactly once — on the PUT that creates or rotates
it. GET never returns it.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.database import get_supabase_admin
from app.repositories.partner_delivery import PartnerDeliveryRepository
from app.repositories.partners import PartnerCredential
from app.schemas.partner import (
    WebhookDeliveriesResponse,
    WebhookDelivery,
    WebhookRequest,
    WebhookResponse,
    WebhookTestResponse,
)
from app.security.partner_auth import SCOPE_WEBHOOKS_MANAGE, require_scope
from app.services import partner_webhooks

router = APIRouter()


@router.put("/webhook", response_model=WebhookResponse)
def register_webhook(
    body: WebhookRequest,
    partner: PartnerCredential = Depends(require_scope(SCOPE_WEBHOOKS_MANAGE)),
) -> WebhookResponse:
    """Register or replace the endpoint. Returns a NEW signing secret each time —
    re-registering rotates it, and the previous secret stops verifying."""
    unknown = [e for e in body.event_types if e not in partner_webhooks.KNOWN_EVENTS]
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown event types: {', '.join(unknown)}. Known: {', '.join(partner_webhooks.KNOWN_EVENTS)}.",
        )
    try:
        url = partner_webhooks.validate_url(body.url)
    except partner_webhooks.InvalidWebhookUrl as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    secret = partner_webhooks.generate_signing_secret()
    repo = PartnerDeliveryRepository(get_supabase_admin())
    row = repo.upsert_webhook(
        partner_id=partner.partner_id,
        url=url,
        signing_secret=secret,
        event_types=body.event_types,
    )
    return WebhookResponse(
        url=row.get("url") or url,
        event_types=row.get("event_types") or body.event_types,
        status=row.get("status") or "active",
        signing_secret=secret,
        last_delivery_at=row.get("last_delivery_at"),
        consecutive_failures=int(row.get("consecutive_failures") or 0),
    )


@router.get("/webhook", response_model=WebhookResponse)
def get_webhook(
    partner: PartnerCredential = Depends(require_scope(SCOPE_WEBHOOKS_MANAGE)),
) -> WebhookResponse:
    repo = PartnerDeliveryRepository(get_supabase_admin())
    row = repo.get_webhook(partner.partner_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No webhook endpoint registered for this partner.",
        )
    return WebhookResponse(
        url=str(row["url"]),
        event_types=row.get("event_types") or [],
        status=str(row.get("status") or "active"),
        signing_secret=None,
        last_delivery_at=row.get("last_delivery_at"),
        consecutive_failures=int(row.get("consecutive_failures") or 0),
    )


@router.post("/webhook/test", response_model=WebhookTestResponse)
def test_webhook(
    partner: PartnerCredential = Depends(require_scope(SCOPE_WEBHOOKS_MANAGE)),
) -> WebhookTestResponse:
    """Send a `ping` event through the real delivery path — same signing, same
    retry ladder, same delivery log. A test that took a shortcut would prove
    nothing about the path that carries real events."""
    repo = PartnerDeliveryRepository(get_supabase_admin())
    webhook = repo.get_webhook(partner.partner_id)
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Register a webhook endpoint first.",
        )
    if partner_webhooks.EVENT_PING not in (webhook.get("event_types") or []):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add the 'ping' event type to your endpoint to receive test events.",
        )
    event_id = partner_webhooks.enqueue_event(
        partner_id=partner.partner_id,
        event_type=partner_webhooks.EVENT_PING,
        payload={"partner": partner.slug},
    )
    return WebhookTestResponse(
        event_id=event_id,
        message="Ping queued." if event_id else "Endpoint is not active.",
    )


@router.get("/webhook/deliveries", response_model=WebhookDeliveriesResponse)
def list_deliveries(
    limit: int = 20,
    partner: PartnerCredential = Depends(require_scope(SCOPE_WEBHOOKS_MANAGE)),
) -> WebhookDeliveriesResponse:
    repo = PartnerDeliveryRepository(get_supabase_admin())
    rows = repo.recent_deliveries(partner.partner_id, limit=max(1, min(limit, 100)))
    return WebhookDeliveriesResponse(
        deliveries=[WebhookDelivery(**row) for row in rows]
    )
