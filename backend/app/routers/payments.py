from __future__ import annotations

import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Any

import razorpay
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from razorpay import errors as razorpay_errors

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.services import xp_service

XP_PACK_PRICE_PAISE = 9900
XP_PACK_AMOUNT = 1000
XP_PACK_CURRENCY = "INR"
XP_PACK_PRODUCT = "myro_xp_launch_pack"

router = APIRouter(prefix="/api", tags=["payments"])


class CreateOrderRequest(BaseModel):
    amount: int
    currency: str = XP_PACK_CURRENCY
    receipt: str | None = Field(default=None, max_length=40)


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str


class VerifyPaymentRequest(BaseModel):
    razorpay_payment_id: str | None = None
    razorpay_order_id: str | None = None
    razorpay_signature: str | None = None


class VerifyPaymentResponse(BaseModel):
    success: bool
    xp_earned: int
    new_xp_balance: int


def _default_receipt(user_id: str) -> str:
    return f"xp_{int(time.time())}_{user_id[:8]}"


def _razorpay_client() -> razorpay.Client:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay credentials are not configured",
        )
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def _razorpay_error(exc: Exception) -> HTTPException:
    message = str(exc) or "Razorpay order creation failed"
    is_auth_error = "auth" in message.lower() or "key" in message.lower()
    return HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY if is_auth_error else status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Razorpay authentication failed" if is_auth_error else "Razorpay order creation failed",
    )


def _signature_matches(order_id: str, payment_id: str, provided_signature: str) -> bool:
    expected = hmac.new(
        settings.razorpay_key_secret.encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, provided_signature)


def _record_created_payment(
    *,
    user_id: str,
    razorpay_order_id: str,
    amount_paise: int,
    currency: str,
    receipt: str,
    xp_amount: int,
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
    return result.data or None


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


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    body: CreateOrderRequest,
    principal: Principal = Depends(get_principal),
) -> CreateOrderResponse:
    if body.amount < 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount must be at least 100 paise")

    currency = body.currency.strip().upper()
    if currency != XP_PACK_CURRENCY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only INR payments are supported")

    if body.amount != XP_PACK_PRICE_PAISE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only the 1000 XP launch pack is available",
        )

    receipt = body.receipt or _default_receipt(principal.id)
    if len(receipt) > 40:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Receipt must be 40 characters or fewer")

    payload = {
        "amount": body.amount,
        "currency": currency,
        "receipt": receipt,
        "notes": {
            "user_id": principal.id,
            "xp_amount": str(XP_PACK_AMOUNT),
            "product": XP_PACK_PRODUCT,
        },
    }

    try:
        order = _razorpay_client().order.create(payload)
    except (razorpay_errors.BadRequestError, razorpay_errors.GatewayError, razorpay_errors.ServerError) as exc:
        raise _razorpay_error(exc) from exc

    order_id = order.get("id")
    if not order_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay did not return an order id",
        )

    _record_created_payment(
        user_id=principal.id,
        razorpay_order_id=order_id,
        amount_paise=int(order.get("amount", body.amount)),
        currency=str(order.get("currency", currency)),
        receipt=receipt,
        xp_amount=XP_PACK_AMOUNT,
    )

    return CreateOrderResponse(
        order_id=order_id,
        amount=int(order.get("amount", body.amount)),
        currency=str(order.get("currency", currency)),
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
    if not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Razorpay credentials are not configured",
        )

    payment = _find_payment_by_order(
        user_id=principal.id,
        razorpay_order_id=body.razorpay_order_id,
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown payment order")

    if not _signature_matches(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signature mismatch")

    payment_currency = str(payment.get("currency", "")).strip().upper()
    if int(payment.get("amount_paise", 0)) != XP_PACK_PRICE_PAISE or payment_currency != XP_PACK_CURRENCY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order does not match launch pack")

    if payment.get("status") == "verified":
        if payment.get("razorpay_payment_id") != body.razorpay_payment_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment order was already verified")
        balance = await xp_service.get_xp_balance(principal.id)
        return VerifyPaymentResponse(success=True, xp_earned=0, new_xp_balance=balance)

    updated = _mark_payment_verified(
        payment_row_id=payment["id"],
        razorpay_payment_id=body.razorpay_payment_id,
        razorpay_signature=body.razorpay_signature,
    )
    if not updated:
        latest = _find_payment_by_order(
            user_id=principal.id,
            razorpay_order_id=body.razorpay_order_id,
        )
        if latest and latest.get("status") == "verified" and latest.get("razorpay_payment_id") == body.razorpay_payment_id:
            balance = await xp_service.get_xp_balance(principal.id)
            return VerifyPaymentResponse(success=True, xp_earned=0, new_xp_balance=balance)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment verification is already in progress")

    xp_amount = int(payment.get("xp_amount") or XP_PACK_AMOUNT)
    new_balance = await xp_service.earn_xp(principal.id, xp_amount)
    return VerifyPaymentResponse(success=True, xp_earned=xp_amount, new_xp_balance=new_balance)
