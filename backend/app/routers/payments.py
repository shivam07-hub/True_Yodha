"""Payments: create an order, verify it, take Razorpay's webhook.

Thin by design (ARCHITECTURE_PAYMENTS.md §3). Prices and availability come from
`billing_catalogue`, every Razorpay call from `razorpay_gateway`, and both the
checkout verify and the webhook hand the arrival to `settlement.settle`, which
grants exactly once.

The ₹199/month engagement (`job_switch_plan`) is a Razorpay subscription, not an
order, and keeps its own path below until S5 deletes it.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.services import (
    billing_catalogue as catalogue,
    engagement_subscription as eng,
    human_check,
    job_switch_plan_service,
    razorpay_gateway as gateway,
    settlement,
    xp_service,
)
from app.services.billing_catalogue import CURRENCY, Product, UnknownProduct
from app.services.razorpay_gateway import Arrival, Failure

router = APIRouter(prefix="/api", tags=["payments"])
logger = logging.getLogger(__name__)

_SUBSCRIPTION_WEBHOOK_EVENTS = {
    "subscription.charged",
    "subscription.activated",
    "subscription.cancelled",
    "subscription.completed",
    "subscription.halted",
}


class CreateOrderRequest(BaseModel):
    amount: int
    currency: str = CURRENCY
    product: str
    receipt: str | None = Field(default=None, max_length=40)
    job_id: str | None = Field(default=None, max_length=200)


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    product: str
    subscription_id: str | None = None


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str | None = None
    razorpay_order_id: str | None = None
    razorpay_subscription_id: str | None = None
    razorpay_signature: str | None = None


class VerifyPaymentResponse(BaseModel):
    success: bool
    coins_earned: int
    new_coin_balance: int
    product: str
    myrology_unlocked: bool = False
    job_switch_plan_active: bool = False


class WebhookAck(BaseModel):
    status: str


def _settlement_store() -> settlement.SettlementStore:
    return settlement.SupabaseSettlementStore()


def _grants() -> settlement.Grants:
    return settlement.default_grants()


def _default_receipt() -> str:
    """Opaque gateway receipt; never disclose the account id to Razorpay."""
    return f"myro_{secrets.token_hex(10)}"


def _gateway_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, gateway.GatewayNotConfigured):
        return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Razorpay credentials are not configured")
    if isinstance(exc, gateway.GatewayAuthFailed):
        return HTTPException(status.HTTP_401_UNAUTHORIZED, "Razorpay authentication failed")
    if isinstance(exc, gateway.GatewayUnreachable):
        return HTTPException(status.HTTP_502_BAD_GATEWAY, "Payment gateway is temporarily unavailable")
    return HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc) or "Razorpay order creation failed")


_GATEWAY_ERRORS = (
    gateway.GatewayNotConfigured,
    gateway.GatewayAuthFailed,
    gateway.GatewayFailed,
    gateway.GatewayUnreachable,
)

_UNAVAILABLE_DETAIL = {
    "not_configured": "Payments are not open yet.",
    "audit_full": "All audit slots are taken this week. Leave your email and we will open the next one to you first.",
}


def _record_created_payment(
    *,
    user_id: str,
    razorpay_order_id: str,
    amount_paise: int,
    currency: str,
    receipt: str,
    product: Product,
    job_id: str | None = None,
    razorpay_subscription_id: str | None = None,
) -> None:
    row: dict[str, Any] = {
        "user_id": user_id,
        "razorpay_order_id": razorpay_order_id,
        "amount_paise": amount_paise,
        "currency": currency,
        "receipt": receipt,
        "xp_amount": product.coins,
        "product": product.key,
        "status": "created",
    }
    if job_id:
        row["job_id"] = job_id
    if razorpay_subscription_id:
        row["razorpay_subscription_id"] = razorpay_subscription_id
    result = get_supabase_admin().table("billing_payments").insert(row).execute()
    if not result.data:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to record payment order")


class CatalogueProduct(BaseModel):
    alias: str
    price_paise: int
    coins: int
    human_checks: int
    available: bool
    unavailable_reason: str | None = None


class HumanCheckOffer(BaseModel):
    checks_full: bool
    ready_by: str  # when a check bought now comes back, shown before paying
    linkedin_coins: int


class CatalogueOut(BaseModel):
    products: list[CatalogueProduct]
    human_check: HumanCheckOffer


def _catalogue() -> CatalogueOut:
    products = []
    for product in catalogue.listed():
        available = catalogue.availability(product)
        products.append(
            CatalogueProduct(
                alias=product.alias,
                price_paise=product.price_paise,
                coins=product.coins,
                human_checks=product.human_checks,
                available=available.available,
                unavailable_reason=available.reason,
            )
        )
    slots = human_check.availability(human_check.SupabaseHumanCheckStore())
    return CatalogueOut(
        products=products,
        human_check=HumanCheckOffer(
            checks_full=slots.checks_full,
            ready_by=slots.ready_by.isoformat(),
            linkedin_coins=human_check.LINKEDIN_CHECK_COINS,
        ),
    )


@router.get("/catalogue", response_model=CatalogueOut)
async def get_catalogue() -> CatalogueOut:
    """Every buy button renders from this: price, whether the server will take
    the order, and when a Human Check bought now comes back."""
    return await run_in_threadpool(_catalogue)


@router.post("/create-order", response_model=CreateOrderResponse, response_model_exclude_none=True)
async def create_order(
    body: CreateOrderRequest,
    principal: Principal = Depends(get_principal),
) -> CreateOrderResponse:
    try:
        product = catalogue.by_alias(body.product)
    except UnknownProduct:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown product") from None

    currency = body.currency.strip().upper()
    if currency != CURRENCY:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only INR payments are supported")
    if body.amount != product.price_paise:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount does not match the selected product price")

    available = await run_in_threadpool(catalogue.availability, product)
    if not available.available:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if available.reason == "not_configured" else status.HTTP_409_CONFLICT
        raise HTTPException(code, _UNAVAILABLE_DETAIL.get(str(available.reason), "Not available right now."))

    # The caller-provided receipt is deliberately ignored: account data must
    # not be forwarded to the payment processor.
    receipt = _default_receipt()

    if product.billing == "subscription":
        return await _create_engagement_subscription(principal.id, product, currency, receipt)

    try:
        order = await run_in_threadpool(
            gateway.create_order, amount_paise=product.price_paise, currency=currency, receipt=receipt
        )
    except _GATEWAY_ERRORS as exc:
        raise _gateway_http_error(exc) from exc

    order_id = str(order["id"])
    amount = int(order.get("amount", product.price_paise))
    order_currency = str(order.get("currency", currency))
    await run_in_threadpool(
        _record_created_payment,
        user_id=principal.id,
        razorpay_order_id=order_id,
        amount_paise=amount,
        currency=order_currency,
        receipt=receipt,
        product=product,
        job_id=body.job_id,
    )
    return CreateOrderResponse(order_id=order_id, amount=amount, currency=order_currency, product=product.key)


@router.post("/verify-payment", response_model=VerifyPaymentResponse)
async def verify_payment(
    body: VerifyPaymentRequest,
    principal: Principal = Depends(get_principal),
) -> VerifyPaymentResponse | JSONResponse:
    if not body.razorpay_order_id or not body.razorpay_payment_id or not body.razorpay_signature:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing payment verification fields")
    if not gateway.configured():
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Razorpay credentials are not configured")

    if body.razorpay_subscription_id:
        return await _verify_engagement_subscription(body, principal.id)

    if not gateway.checkout_signature_ok(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signature mismatch")

    arrival = Arrival(
        order_id=body.razorpay_order_id,
        payment_id=body.razorpay_payment_id,
        source="checkout",
        user_id=principal.id,
    )
    try:
        result = await settlement.settle(arrival, store=_settlement_store(), grants=_grants())
    except UnknownProduct:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment order has an unknown product") from None

    if result.outcome == "unknown_order":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown payment order")
    if result.outcome == "amount_mismatch":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment order does not match product price")
    if result.outcome == "grant_pending":
        # Money is in; the grant has not finished. The next arrival (the
        # webhook, or this call retried) finishes it.
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content={"outcome": "grant_pending"})

    product = result.product
    assert product is not None  # granted / already_granted always carry it
    balance = result.new_coin_balance
    if balance is None:
        balance = await xp_service.get_xp_balance(principal.id)
    return VerifyPaymentResponse(
        success=True,
        coins_earned=product.coins if result.outcome == "granted" else 0,
        new_coin_balance=balance,
        product=product.key,
        myrology_unlocked=product.alias == "myrology",
    )


@router.post("/razorpay/webhook", response_model=WebhookAck)
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str | None = Header(default=None),
) -> WebhookAck | JSONResponse:
    """Server-to-server arrival. Razorpay POSTs `payment.captured` whether or
    not the browser ever called /verify-payment (tab closed after the charge).

    A grant that has not finished answers 500 so Razorpay delivers again; every
    other validly signed event answers 2xx so it stops.
    """
    if not gateway.webhook_secret():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Razorpay webhook is not configured")

    raw_body = await request.body()
    if not x_razorpay_signature or not gateway.webhook_signature_ok(raw_body, x_razorpay_signature):
        logger.warning("metric webhook.bad_signature bytes=%d", len(raw_body))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature")

    try:
        event = json.loads(raw_body)
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed webhook payload") from None
    if not isinstance(event, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Malformed webhook payload")

    if event.get("event") in _SUBSCRIPTION_WEBHOOK_EVENTS:
        return await _reconcile_subscription_event(event, x_razorpay_signature)

    parsed = gateway.parse_webhook(event)
    if parsed is None:
        return WebhookAck(status="ignored")
    if isinstance(parsed, Failure):
        await settlement.record_failure(parsed, store=_settlement_store())
        return WebhookAck(status="failed")

    result = await settlement.settle(parsed, store=_settlement_store(), grants=_grants())
    if result.outcome == "grant_pending":
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"status": "grant_pending"})
    logger.info("metric webhook.settled outcome=%s", result.outcome)
    return WebhookAck(status=result.outcome)


# ── ₹199/month engagement (subscription). Deleted in S5. ──────────────────────


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


def _find_payment_by_subscription_id(subscription_id: str) -> dict[str, Any] | None:
    result = (
        get_supabase_admin()
        .table("billing_payments")
        .select("*")
        .eq("razorpay_subscription_id", subscription_id)
        .order("created_at")
        .limit(1)
        .execute()
    )
    rows = (result.data if result else None) or []
    return rows[0] if rows else None


def _find_payment_by_payment_id(razorpay_payment_id: str) -> dict[str, Any] | None:
    result = (
        get_supabase_admin()
        .table("billing_payments")
        .select("*")
        .eq("razorpay_payment_id", razorpay_payment_id)
        .maybe_single()
        .execute()
    )
    return (result.data if result else None) or None


def _mark_payment_verified(*, payment_row_id: str, razorpay_payment_id: str, razorpay_signature: str) -> bool:
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


def _record_renewal_payment(
    *,
    user_id: str,
    razorpay_order_id: str,
    razorpay_payment_id: str,
    razorpay_subscription_id: str,
    amount_paise: int,
    currency: str,
    product_key: str,
) -> None:
    get_supabase_admin().table("billing_payments").insert(
        {
            "user_id": user_id,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_subscription_id": razorpay_subscription_id,
            "amount_paise": amount_paise,
            "currency": currency,
            "receipt": _default_receipt(),
            "xp_amount": 0,
            "product": product_key,
            "status": "verified",
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }
    ).execute()


def _activate_engagement(user_id: str, payment: dict[str, Any]) -> None:
    sub_id = str(payment.get("razorpay_subscription_id") or "") or None
    job_switch_plan_service.activate_plan(user_id, subscription_id=sub_id)


async def _create_engagement_subscription(
    user_id: str,
    product: Product,
    currency: str,
    receipt: str,
) -> CreateOrderResponse:
    eng.require_sale(open_pass_count=job_switch_plan_service.open_pass_count)
    if await run_in_threadpool(job_switch_plan_service.has_active_subscription, user_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a live engagement.")
    try:
        sub = await run_in_threadpool(gateway.create_subscription, eng.subscription_payload())
    except _GATEWAY_ERRORS as exc:
        raise _gateway_http_error(exc) from exc
    sub_id = str(sub["id"])
    await run_in_threadpool(
        _record_created_payment,
        user_id=user_id,
        razorpay_order_id=sub_id,
        amount_paise=product.price_paise,
        currency=currency,
        receipt=receipt,
        product=product,
        razorpay_subscription_id=sub_id,
    )
    return CreateOrderResponse(
        order_id=sub_id,
        amount=product.price_paise,
        currency=currency,
        product=product.key,
        subscription_id=sub_id,
    )


async def _verify_engagement_subscription(body: VerifyPaymentRequest, user_id: str) -> VerifyPaymentResponse:
    assert body.razorpay_order_id and body.razorpay_payment_id and body.razorpay_signature
    payment = await run_in_threadpool(
        _find_payment_by_order, user_id=user_id, razorpay_order_id=body.razorpay_order_id
    )
    if not payment:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown payment order")
    _, secret = gateway.credentials()
    if not eng.subscription_signature_matches(
        body.razorpay_payment_id, str(body.razorpay_subscription_id), body.razorpay_signature, secret
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Signature mismatch")
    product = catalogue.by_key(str(payment.get("product") or ""))
    if product.billing != "subscription":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment order is not a subscription")
    if payment.get("status") == "created":
        won = await run_in_threadpool(
            _mark_payment_verified,
            payment_row_id=payment["id"],
            razorpay_payment_id=body.razorpay_payment_id,
            razorpay_signature=body.razorpay_signature,
        )
        if won:
            await run_in_threadpool(_activate_engagement, user_id, payment)
    elif payment.get("razorpay_payment_id") != body.razorpay_payment_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment order was already verified")
    return VerifyPaymentResponse(
        success=True,
        coins_earned=0,
        new_coin_balance=await xp_service.get_xp_balance(user_id),
        product=product.key,
        job_switch_plan_active=True,
    )


async def _reconcile_subscription_event(event: dict[str, Any], signature: str) -> WebhookAck:
    charge = eng.parse_subscription_event(event)
    if charge is None:
        return WebhookAck(status="ignored")
    if eng.is_stop_event(charge.event):
        await run_in_threadpool(job_switch_plan_service.mark_subscription_stopped, charge.subscription_id)
        return WebhookAck(status="stopped")
    payment = await run_in_threadpool(_find_payment_by_subscription_id, charge.subscription_id)
    if not payment:
        logger.warning("metric webhook.unknown_subscription")
        return WebhookAck(status="unknown_order")
    try:
        product = catalogue.by_key(str(payment.get("product") or ""))
    except UnknownProduct:
        return WebhookAck(status="unknown_product")
    if not charge.payment_id:
        return WebhookAck(status="ignored")
    if payment.get("status") == "created":
        won = await run_in_threadpool(
            _mark_payment_verified,
            payment_row_id=payment["id"],
            razorpay_payment_id=charge.payment_id,
            razorpay_signature=f"webhook:{signature[:80]}",
        )
        if not won:
            return WebhookAck(status="already_verified")
        await run_in_threadpool(_activate_engagement, str(payment["user_id"]), payment)
        return WebhookAck(status="reconciled")
    if charge.payment_id == payment.get("razorpay_payment_id"):
        return WebhookAck(status="already_verified")
    if await run_in_threadpool(_find_payment_by_payment_id, charge.payment_id):
        return WebhookAck(status="already_verified")
    await run_in_threadpool(
        _record_renewal_payment,
        user_id=str(payment["user_id"]),
        razorpay_order_id=charge.order_id or f"subcharge_{charge.payment_id}",
        razorpay_payment_id=charge.payment_id,
        razorpay_subscription_id=charge.subscription_id,
        amount_paise=product.price_paise,
        currency=CURRENCY,
        product_key=product.key,
    )
    await run_in_threadpool(job_switch_plan_service.renew_period, str(payment["user_id"]))
    logger.info("metric webhook.subscription_renewed sub=%s", charge.subscription_id)
    return WebhookAck(status="renewed")
