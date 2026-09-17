"""₹199 / month Personalised Engagement — Razorpay Subscriptions.

The last consumer CTA. Guidance is ours; conversion is theirs. This module
creates the subscription, verifies the checkout signature, and reads the
recurring-charge webhook. Fulfilment (the scene, the monthly pass) stays in
job_switch_plan_service so a gateway change does not rewrite the queue.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import HTTPException, status

from app.config import settings

ENGAGEMENT_PRICE_PAISE = 19900
SUBSCRIPTION_TOTAL_COUNT = 12
MAX_OPEN_PASSES = 5
PRODUCT_ALIAS = "job_switch_plan"
PRODUCT_KEY = "myro_job_switch_plan"

_SUBSCRIPTION_CHARGE_EVENTS = {"subscription.charged", "subscription.activated"}
_SUBSCRIPTION_STOP_EVENTS = {"subscription.cancelled", "subscription.completed", "subscription.halted"}


def _clean(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def sales_enabled() -> bool:
    return bool(settings.engagement_sales_enabled)


def plan_id() -> str:
    return _clean(settings.razorpay_engagement_plan_id)


def require_sale(*, open_pass_count: Callable[[], int]) -> None:
    """Refuse before Razorpay sees the buyer. Taking money we cannot staff is
    the failure this guard exists to prevent."""
    if not sales_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Engagement sales are paused.",
        )
    if not plan_id():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Engagement subscriptions are not configured.",
        )
    if open_pass_count() >= MAX_OPEN_PASSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Every engagement slot is taken this week. The next one opens when a pass is delivered.",
        )


def subscription_payload() -> dict[str, Any]:
    return {
        "plan_id": plan_id(),
        "total_count": SUBSCRIPTION_TOTAL_COUNT,
        "quantity": 1,
        "customer_notify": 1,
    }


def subscription_signature_matches(
    payment_id: str,
    subscription_id: str,
    provided_signature: str,
    secret: str,
) -> bool:
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{payment_id}|{subscription_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, provided_signature)


@dataclass(frozen=True)
class SubscriptionCharge:
    subscription_id: str
    payment_id: str | None
    order_id: str | None
    event: str


def parse_subscription_event(event: dict[str, Any]) -> SubscriptionCharge | None:
    event_type = str(event.get("event") or "")
    payload = event.get("payload") or {}
    sub = ((payload.get("subscription") or {}).get("entity") or {})
    payment = ((payload.get("payment") or {}).get("entity") or {})
    subscription_id = sub.get("id")
    if event_type in _SUBSCRIPTION_CHARGE_EVENTS:
        if not subscription_id:
            return None
        return SubscriptionCharge(
            subscription_id=str(subscription_id),
            payment_id=str(payment["id"]) if payment.get("id") else None,
            order_id=str(payment["order_id"]) if payment.get("order_id") else None,
            event=event_type,
        )
    if event_type in _SUBSCRIPTION_STOP_EVENTS and subscription_id:
        return SubscriptionCharge(
            subscription_id=str(subscription_id),
            payment_id=None,
            order_id=None,
            event=event_type,
        )
    return None


def is_stop_event(event: str) -> bool:
    return event in _SUBSCRIPTION_STOP_EVENTS


def is_charge_event(event: str) -> bool:
    return event in _SUBSCRIPTION_CHARGE_EVENTS
