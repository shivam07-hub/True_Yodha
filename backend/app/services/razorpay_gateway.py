"""The only code that speaks Razorpay (ARCHITECTURE_PAYMENTS.md §3 B).

One credential cleaner, one client, order creation, the two signature checks,
and the reading of a webhook event into an `Arrival` or a `Failure`.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Any, Literal

import razorpay
import requests
from razorpay import errors as razorpay_errors

from app.config import settings

ORDER_TIMEOUT_SECONDS = 12


@dataclass(frozen=True)
class Arrival:
    """Razorpay says money arrived for an order."""

    order_id: str
    payment_id: str
    source: Literal["checkout", "webhook", "retry"]
    user_id: str | None = None  # the checkout path is scoped to its caller


@dataclass(frozen=True)
class Failure:
    """Razorpay says a payment attempt on an order failed."""

    order_id: str
    payment_id: str

logger = logging.getLogger(__name__)


class GatewayNotConfigured(RuntimeError):
    """The Razorpay key pair is missing."""


class GatewayAuthFailed(RuntimeError):
    """Razorpay refused our credentials."""


class GatewayFailed(RuntimeError):
    """Razorpay answered with an error that is not about credentials."""


class GatewayUnreachable(RuntimeError):
    """The network call to Razorpay did not complete."""


def clean_credential(value: str) -> str:
    """Strip whitespace and one pair of matching quotes pasted into an env var."""
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def credentials() -> tuple[str, str]:
    key_id = clean_credential(settings.razorpay_key_id)
    key_secret = clean_credential(settings.razorpay_key_secret)
    if not key_id or not key_secret:
        raise GatewayNotConfigured("Razorpay credentials are not configured")
    return key_id, key_secret


def configured() -> bool:
    try:
        credentials()
    except GatewayNotConfigured:
        return False
    return True


def client() -> razorpay.Client:
    key_id, key_secret = credentials()
    rzp = razorpay.Client(
        auth=(key_id, key_secret),
        max_retries=3,
        initial_delay=0.4,
        max_delay=2,
        jitter=0.2,
    )
    rzp.enable_retry(True)
    return rzp


def _translate(exc: Exception) -> RuntimeError:
    if isinstance(exc, requests.exceptions.RequestException):
        logger.error("Razorpay network failure reason=%s", type(exc).__name__)
        return GatewayUnreachable("Payment gateway is temporarily unavailable")
    message = (str(exc) or "").lower()
    logger.warning("Razorpay call failed reason=%s", type(exc).__name__)
    if any(term in message for term in ("auth", "key", "credential", "secret", "token")):
        return GatewayAuthFailed("Razorpay authentication failed")
    return GatewayFailed("Razorpay order creation failed")


_RAZORPAY_ERRORS = (
    razorpay_errors.BadRequestError,
    razorpay_errors.GatewayError,
    razorpay_errors.ServerError,
    requests.exceptions.RequestException,
)


def create_order(*, amount_paise: int, currency: str, receipt: str) -> dict[str, Any]:
    """Create a plain order. Returns Razorpay's order dict, which carries `id`."""
    payload = {"amount": amount_paise, "currency": currency, "receipt": receipt}
    try:
        order = client().order.create(payload, timeout=ORDER_TIMEOUT_SECONDS)
    except _RAZORPAY_ERRORS as exc:
        raise _translate(exc) from exc
    if not order.get("id"):
        logger.error("Razorpay order create returned no id")
        raise GatewayFailed("Razorpay did not return an order id")
    return order


def checkout_signature_ok(order_id: str, payment_id: str, signature: str) -> bool:
    _, key_secret = credentials()
    expected = hmac.new(
        key_secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def webhook_secret() -> str:
    return clean_credential(settings.razorpay_webhook_secret)


def webhook_signature_ok(raw_body: bytes, signature: str) -> bool:
    """Razorpay signs the RAW body with the webhook secret (not the API key
    secret). Compute over the exact bytes received, never re-serialised JSON."""
    secret = webhook_secret()
    if not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def parse_webhook(event: dict[str, Any]) -> Arrival | Failure | None:
    """`payment.captured` → Arrival, `payment.failed` → Failure, else None."""
    kind = event.get("event")
    if kind not in ("payment.captured", "payment.failed"):
        return None
    entity = ((event.get("payload") or {}).get("payment") or {}).get("entity") or {}
    order_id, payment_id = entity.get("order_id"), entity.get("id")
    if not order_id or not payment_id:
        logger.warning("metric webhook.missing_ids event=%s", kind)
        return None
    if kind == "payment.failed":
        return Failure(order_id=str(order_id), payment_id=str(payment_id))
    return Arrival(order_id=str(order_id), payment_id=str(payment_id), source="webhook")
