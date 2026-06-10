from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import razorpay
import requests
from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from razorpay import errors as razorpay_errors

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.services import xp_service

CURRENCY = "INR"
RAZORPAY_ORDER_TIMEOUT_SECONDS = 12

# Webhook events that fulfil an order. `payment.captured` is the canonical
# money-received signal and always carries the payment entity (order_id + id).
_HANDLED_WEBHOOK_EVENTS = {"payment.captured"}


@dataclass(frozen=True)
class Product:
    """A purchasable item. ``key`` is the value persisted in billing_payments.product."""

    key: str
    price_paise: int
    xp_amount: int  # 0 for entitlement products
    kind: str  # "xp" | "entitlement"


# Friendly request alias -> Product. Existing XP-pack clients omit the product
# field entirely, so "xp_pack" must stay the default.
PRODUCTS: dict[str, Product] = {
    "xp_pack": Product(key="myro_xp_launch_pack", price_paise=9900, xp_amount=1000, kind="xp"),
    "myrology": Product(key="myro_myrology_unlock", price_paise=49900, xp_amount=0, kind="entitlement"),
}
# Reverse lookup keyed by the persisted product key (used on verify).
_PRODUCT_BY_KEY: dict[str, Product] = {p.key: p for p in PRODUCTS.values()}

# Back-compat constants referenced elsewhere / in tests.
XP_PACK_PRICE_PAISE = PRODUCTS["xp_pack"].price_paise
XP_PACK_AMOUNT = PRODUCTS["xp_pack"].xp_amount
XP_PACK_CURRENCY = CURRENCY
XP_PACK_PRODUCT = PRODUCTS["xp_pack"].key

router = APIRouter(prefix="/api", tags=["payments"])
logger = logging.getLogger(__name__)


class CreateOrderRequest(BaseModel):
    amount: int
    currency: str = CURRENCY
    product: str = "xp_pack"
    receipt: str | None = Field(default=None, max_length=40)


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    product: str


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str | None = None
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None


class VerifyPaymentResponse(BaseModel):
    success: bool
    xp_earned: int
    new_xp_balance: int
    product: str
    myrology_unlocked: bool = False


def _default_receipt(user_id: str) -> str:
    return f"xp_{int(time.time())}_{user_id[:8]}"


def _clean_credential(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def _razorpay_credentials() -> tuple[str, str]:
    key_id = _clean_credential(settings.razorpay_key_id)
    key_secret = _clean_credential(settings.razorpay_key_secret)
    if not key_id or not key_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay credentials are not configured",
        )
    return key_id, key_secret


def _razorpay_client() -> razorpay.Client:
    key_id, key_secret = _razorpay_credentials()
    client = razorpay.Client(
        auth=(key_id, key_secret),
        max_retries=3,
        initial_delay=0.4,
        max_delay=2,
        jitter=0.2,
    )
    client.enable_retry(True)
    return client


def _create_razorpay_order(payload: dict[str, Any]) -> dict[str, Any]:
    client = _razorpay_client()
    return client.order.create(payload, timeout=RAZORPAY_ORDER_TIMEOUT_SECONDS)


def _razorpay_error(exc: Exception) -> HTTPException:
    message = str(exc) or "Razorpay order creation failed"
    lowered = message.lower()
    is_auth_error = any(term in lowered for term in ("auth", "key", "credential", "secret", "token"))
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED if is_auth_error else status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Razorpay authentication failed" if is_auth_error else "Razorpay order creation failed",
    )


def _signature_matches(order_id: str, payment_id: str, provided_signature: str) -> bool:
    _, key_secret = _razorpay_credentials()
    expected = hmac.new(
        key_secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, provided_signature)


def _webhook_signature_matches(raw_body: bytes, provided_signature: str) -> bool:
    """Razorpay signs the RAW webhook body with the webhook secret (distinct
    from the API key secret). The signature must be computed over the exact
    bytes received — never the re-serialised JSON."""
    secret = _clean_credential(settings.razorpay_webhook_secret)
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided_signature)


def _extract_order_and_payment(event: dict[str, Any]) -> tuple[str | None, str | None]:
    entity = (((event.get("payload") or {}).get("payment") or {}).get("entity") or {})
    return entity.get("order_id"), entity.get("id")


def _record_created_payment(
    *,
    user_id: str,
    razorpay_order_id: str,
    amount_paise: int,
    currency: str,
    receipt: str,
    xp_amount: int,
    product_key: str,
) -> None:
    result = (
        get_supabase_admin()
        .table("billing_payments")
        .insert(
            {
                "user_id": user_id,
                "razorpay_order_id": razorpay_order_id,
                "amount_paise": amount_paise,
                "currency": currency,
                "receipt": receipt,
                "xp_amount": xp_amount,
                "product": product_key,
                "status": "created",
            }
        )
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record payment order",
        )


def _find_payment_by_order(*, user_id: str, razorpay_order_id: str) -> dict[str, Any] | None:
    result = (
        get_supabase_admin()
        .table("billing_payments")
        .select("*")
        .eq("user_id", user_id)
        .eq("razorpay_order_id", razorpay_order_id)
        .maybe_single()
        .execute()
    )
    return (result.data if result else None) or None


def _find_payment_by_order_id(razorpay_order_id: str) -> dict[str, Any] | None:
    """Order lookup WITHOUT a user scope — the webhook is server-to-server and
    has no authenticated principal; it reconciles purely on the order id."""
    result = (
        get_supabase_admin()
        .table("billing_payments")
        .select("*")
        .eq("razorpay_order_id", razorpay_order_id)
        .maybe_single()
        .execute()
    )
    return (result.data if result else None) or None


def _mark_payment_verified(
    *,
    payment_row_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str,
) -> bool:
    result = (
        get_supabase_admin()
        .table("billing_payments")
        .update(
            {
                "status": "verified",
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", payment_row_id)
        .eq("status", "created")
        .execute()
    )
    return bool(result.data)


def _unlock_myrology(user_id: str) -> None:
    # Paying implies interest — set both so the payer gets the nav icon without
    # hunting the opt-in toggle. `myrology_unlocked` still guards the paid routes.
    get_supabase_admin().table("user_profiles").update(
        {"myrology_unlocked": True, "myrology_interested": True}
    ).eq("id", user_id).execute()


async def _apply_fulfilment(user_id: str, product: Product, payment: dict[str, Any]) -> int:
    """Apply a product's effect and return the resulting XP balance.

    MUST only be called by the path that won the atomic created->verified CAS
    (``_mark_payment_verified`` returning True), or on a confirmed-idempotent
    replay. That guard is what makes fulfilment exactly-once across the browser
    verify path, the webhook, and webhook retries — never double-credit / double-unlock.
    """
    if product.kind == "entitlement":
        await run_in_threadpool(_unlock_myrology, user_id)
        return await xp_service.get_xp_balance(user_id)
    xp_amount = int(payment.get("xp_amount") or product.xp_amount)
    return await xp_service.earn_xp(user_id, xp_amount)


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    body: CreateOrderRequest,
    principal: Principal = Depends(get_principal),
) -> CreateOrderResponse:
    product = PRODUCTS.get(body.product)
    if product is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown product")

    currency = body.currency.strip().upper()
    if currency != CURRENCY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only INR payments are supported")

    if body.amount != product.price_paise:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount does not match the selected product price",
        )

    receipt = body.receipt or _default_receipt(principal.id)
    if len(receipt) > 40:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Receipt must be 40 characters or fewer")

    payload = {
        "amount": product.price_paise,
        "currency": currency,
        "receipt": receipt,
        "notes": {
            "user_id": principal.id,
            "xp_amount": str(product.xp_amount),
            "product": product.key,
        },
    }

    try:
        order = await run_in_threadpool(_create_razorpay_order, payload)
    except (razorpay_errors.BadRequestError, razorpay_errors.GatewayError, razorpay_errors.ServerError) as exc:
        logger.warning("Razorpay order create failed for user %s: %s", principal.id, str(exc))
        raise _razorpay_error(exc) from exc
    except requests.exceptions.RequestException as exc:
        logger.error("Razorpay network failure for user %s: %s", principal.id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment gateway is temporarily unavailable",
        ) from exc

    order_id = order.get("id")
    if not order_id:
        logger.error("Razorpay order create returned no id for user %s", principal.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay did not return an order id",
        )

    await run_in_threadpool(
        _record_created_payment,
        user_id=principal.id,
        razorpay_order_id=order_id,
        amount_paise=int(order.get("amount", product.price_paise)),
        currency=str(order.get("currency", currency)),
        receipt=receipt,
        xp_amount=product.xp_amount,
        product_key=product.key,
    )

    return CreateOrderResponse(
        order_id=order_id,
        amount=int(order.get("amount", product.price_paise)),
        currency=str(order.get("currency", currency)),
        product=product.key,
    )


@router.post("/verify-payment", response_model=VerifyPaymentResponse)
async def verify_payment(
    body: VerifyPaymentRequest,
    principal: Principal = Depends(get_principal),
) -> VerifyPaymentResponse:
    if not body.razorpay_order_id or not body.razorpay_payment_id or not body.razorpay_signature:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing payment verification fields",
        )
    if not _clean_credential(settings.razorpay_key_secret):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay credentials are not configured",
        )

    payment = await run_in_threadpool(
        _find_payment_by_order,
        user_id=principal.id,
        razorpay_order_id=body.razorpay_order_id,
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown payment order")

    if not _signature_matches(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signature mismatch")

    product = _PRODUCT_BY_KEY.get(str(payment.get("product") or XP_PACK_PRODUCT))
    if product is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order has an unknown product")

    payment_currency = str(payment.get("currency", "")).strip().upper()
    if int(payment.get("amount_paise", 0)) != product.price_paise or payment_currency != CURRENCY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order does not match product price")

    # Idempotent replay of an already-verified order.
    if payment.get("status") == "verified":
        if payment.get("razorpay_payment_id") != body.razorpay_payment_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order was already verified")
        return await _fulfilment_snapshot(principal.id, product)

    updated = await run_in_threadpool(
        _mark_payment_verified,
        payment_row_id=payment["id"],
        razorpay_payment_id=body.razorpay_payment_id,
        razorpay_signature=body.razorpay_signature,
    )
    if not updated:
        latest = await run_in_threadpool(
            _find_payment_by_order,
            user_id=principal.id,
            razorpay_order_id=body.razorpay_order_id,
        )
        if latest and latest.get("status") == "verified" and latest.get("razorpay_payment_id") == body.razorpay_payment_id:
            return await _fulfilment_snapshot(principal.id, product)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment verification is already in progress")

    balance = await _apply_fulfilment(principal.id, product, payment)
    xp_earned = 0 if product.kind == "entitlement" else int(payment.get("xp_amount") or product.xp_amount)
    return VerifyPaymentResponse(
        success=True,
        xp_earned=xp_earned,
        new_xp_balance=balance,
        product=product.key,
        myrology_unlocked=product.kind == "entitlement",
    )


async def _fulfilment_snapshot(user_id: str, product: Product) -> VerifyPaymentResponse:
    """Response for an already-fulfilled order — earns nothing, reports current state."""
    balance = await xp_service.get_xp_balance(user_id)
    return VerifyPaymentResponse(
        success=True,
        xp_earned=0,
        new_xp_balance=balance,
        product=product.key,
        myrology_unlocked=product.kind == "entitlement",
    )


class WebhookAck(BaseModel):
    status: str


@router.post("/razorpay/webhook", response_model=WebhookAck)
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
) -> WebhookAck:
    """Server-to-server fulfilment fallback.

    Razorpay POSTs here on ``payment.captured`` regardless of whether the
    browser ever called ``/verify-payment`` (tab closed / network dropped after
    the charge). We verify the webhook signature over the RAW body, then
    reconcile the order through the SAME atomic created->verified CAS the
    browser path uses — so the two races converge to exactly-once fulfilment.

    Always returns 2xx for a validly-signed request (even for orders we don't
    recognise or have already fulfilled) so Razorpay stops retrying. Only an
    invalid/absent signature or an unconfigured secret is a non-2xx.
    """
    secret = _clean_credential(settings.razorpay_webhook_secret)
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay webhook is not configured",
        )

    raw_body = await request.body()
    if not x_razorpay_signature or not _webhook_signature_matches(raw_body, x_razorpay_signature):
        logger.warning("metric webhook.bad_signature bytes=%d", len(raw_body))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    try:
        event = json.loads(raw_body)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Malformed webhook payload")

    event_type = event.get("event") if isinstance(event, dict) else None
    if event_type not in _HANDLED_WEBHOOK_EVENTS:
        return WebhookAck(status="ignored")

    order_id, payment_id = _extract_order_and_payment(event)
    if not order_id or not payment_id:
        logger.warning("metric webhook.missing_ids event=%s", event_type)
        return WebhookAck(status="ignored")

    payment = await run_in_threadpool(_find_payment_by_order_id, order_id)
    if not payment:
        # Order we never created (e.g. a different Razorpay account / env). Ack
        # so Razorpay stops retrying; nothing to fulfil here.
        logger.warning("metric webhook.unknown_order order=%s", order_id)
        return WebhookAck(status="unknown_order")

    product = _PRODUCT_BY_KEY.get(str(payment.get("product") or XP_PACK_PRODUCT))
    if product is None:
        logger.error("metric webhook.unknown_product order=%s product=%s", order_id, payment.get("product"))
        return WebhookAck(status="unknown_product")

    payment_currency = str(payment.get("currency", "")).strip().upper()
    if int(payment.get("amount_paise", 0)) != product.price_paise or payment_currency != CURRENCY:
        logger.error("metric webhook.amount_mismatch order=%s", order_id)
        return WebhookAck(status="amount_mismatch")

    if payment.get("status") == "verified":
        return WebhookAck(status="already_verified")

    updated = await run_in_threadpool(
        _mark_payment_verified,
        payment_row_id=payment["id"],
        razorpay_payment_id=payment_id,
        razorpay_signature=f"webhook:{x_razorpay_signature[:80]}",
    )
    if not updated:
        # Lost the CAS to the browser verify (or a concurrent webhook delivery).
        # The winner already fulfilled — nothing to do.
        return WebhookAck(status="already_verified")

    await _apply_fulfilment(str(payment["user_id"]), product, payment)
    logger.info(
        "metric webhook.reconciled order=%s product=%s user=%s",
        order_id,
        product.key,
        payment.get("user_id"),
    )
    return WebhookAck(status="reconciled")
