"""Myrology surface: birth-details intake + session booking requests.

Intake is collected BEFORE payment (auth-gated only). Session bookings stay
behind the ₹299 entitlement (user_profiles.myrology_unlocked). Writes use the
service-role admin client — the tables expose SELECT-own RLS only. Booking
requests are emailed to the in-house astrologer for manual confirm; the email is
best-effort and never blocks the durable booking row.
"""

from __future__ import annotations

import hmac
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.schemas.myrology import (
    BookingListResponse,
    BookingRequest,
    BookingResponse,
    BookingStatusUpdate,
    IntakeRequest,
    IntakeResponse,
)
from app.services import email_service

router = APIRouter(prefix="/myrology", tags=["myrology"])
logger = logging.getLogger(__name__)

# Lifecycle: requested -> confirmed -> done, with cancel reachable from either
# live state. 'done' and 'cancelled' are terminal. Keyed by target status =>
# the set of source statuses it may be reached from.
_ALLOWED_BOOKING_TRANSITIONS: dict[str, set[str]] = {
    "confirmed": {"requested"},
    "done": {"requested", "confirmed"},
    "cancelled": {"requested", "confirmed"},
}
_BOOKING_TIMESTAMP_COLUMN: dict[str, str] = {
    "confirmed": "confirmed_at",
    "done": "done_at",
    "cancelled": "cancelled_at",
}


def require_myrology_admin(x_myro_admin_token: str | None = Header(default=None)) -> None:
    expected = settings.myrology_admin_token.strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Myrology admin endpoint is not configured.",
        )
    supplied = (x_myro_admin_token or "").strip()
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Myrology admin token.",
        )


def _require_unlocked(user_id: str) -> None:
    result = (
        get_supabase_admin()
        .table("user_profiles")
        .select("myrology_unlocked")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    row = result.data if result else None
    if not row or not row.get("myrology_unlocked"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Myrology is locked. Unlock it to continue.",
        )


def _fetch_intake(user_id: str) -> dict[str, Any] | None:
    result = (
        get_supabase_admin()
        .table("myrology_intake")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    return (result.data if result else None) or None


def _upsert_intake(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    record = {**payload, "user_id": user_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    result = (
        get_supabase_admin()
        .table("myrology_intake")
        .upsert(record, on_conflict="user_id")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save intake")
    return result.data[0]


def _insert_booking(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    result = (
        get_supabase_admin()
        .table("myrology_bookings")
        .insert({**payload, "user_id": user_id})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create booking")
    return result.data[0]


def _list_bookings(user_id: str) -> list[dict[str, Any]]:
    result = (
        get_supabase_admin()
        .table("myrology_bookings")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def _transition_booking(booking_id: str, new_status: str) -> dict[str, Any]:
    """Advance a booking to ``new_status``, stamping the matching timestamp.

    Validates the transition against the current row (terminal states can't
    move; illegal jumps are rejected) and writes via an atomic compare-and-set
    on the source status so concurrent transitions can't both apply.
    """
    admin = get_supabase_admin()
    current = (
        admin.table("myrology_bookings").select("*").eq("id", booking_id).maybe_single().execute()
    )
    row = current.data if current else None
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    from_status = str(row.get("status"))
    if from_status == new_status:
        return row  # idempotent no-op
    allowed_from = _ALLOWED_BOOKING_TRANSITIONS.get(new_status, set())
    if from_status not in allowed_from:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot move a '{from_status}' booking to '{new_status}'.",
        )

    now = datetime.now(timezone.utc).isoformat()
    patch = {"status": new_status, "updated_at": now, _BOOKING_TIMESTAMP_COLUMN[new_status]: now}
    updated = (
        admin.table("myrology_bookings")
        .update(patch)
        .eq("id", booking_id)
        .eq("status", from_status)  # CAS: only if nobody else moved it first
        .execute()
    )
    if not updated.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Booking status changed concurrently — reload and retry.",
        )
    return updated.data[0]


def _notify_astrologer(*, user_email: str, intake: dict[str, Any] | None, booking: dict[str, Any]) -> None:
    """Email the booking request to the in-house astrologer. Best-effort."""
    if intake:
        birth = (
            f"DOB: {intake.get('dob')}\n"
            f"Time: {'unknown (rectify in session 1)' if intake.get('birth_time_unknown') else intake.get('birth_time')}\n"
            f"Place: {intake.get('birth_place')}\n"
            f"Guidance sought: {intake.get('guidance_note') or '—'}"
        )
    else:
        birth = "No intake on file."

    body = (
        "New Myrology booking request.\n\n"
        f"Booking ID: {booking.get('id')}\n"
        f"Native contact: {user_email}\n"
        f"Preferred windows: {booking.get('preferred_windows')}\n"
        f"Topic: {booking.get('topic') or '—'}\n\n"
        f"Birth details\n{birth}\n"
    )
    email_service.send_email(
        to=settings.myrology_astrologer_email,
        subject="Myrology · new booking request",
        text=body,
    )


@router.get("/intake", response_model=IntakeResponse | None)
async def get_intake(principal: Principal = Depends(get_principal)) -> IntakeResponse | None:
    # Intake is now collected BEFORE payment, so it is auth-gated only — no
    # unlock requirement. Bookings stay behind the paid gate below.
    row = await run_in_threadpool(_fetch_intake, principal.id)
    if not row:
        return None
    return IntakeResponse(**row)


@router.post("/intake", response_model=IntakeResponse)
async def save_intake(
    body: IntakeRequest,
    principal: Principal = Depends(get_principal),
) -> IntakeResponse:
    # Pre-payment intake: auth-gated only (see get_intake note above).
    payload = {
        "dob": body.dob.isoformat(),
        "birth_time": None if body.birth_time_unknown or body.birth_time is None else body.birth_time.isoformat(),
        "birth_time_unknown": body.birth_time_unknown,
        "birth_place": body.birth_place,
        "guidance_note": body.guidance_note,
    }
    row = await run_in_threadpool(_upsert_intake, principal.id, payload)
    return IntakeResponse(**row)


@router.get("/bookings", response_model=BookingListResponse)
async def get_bookings(principal: Principal = Depends(get_principal)) -> BookingListResponse:
    await run_in_threadpool(_require_unlocked, principal.id)
    rows = await run_in_threadpool(_list_bookings, principal.id)
    return BookingListResponse(bookings=[BookingResponse(**row) for row in rows])


@router.post("/booking", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    body: BookingRequest,
    principal: Principal = Depends(get_principal),
) -> BookingResponse:
    await run_in_threadpool(_require_unlocked, principal.id)
    intake = await run_in_threadpool(_fetch_intake, principal.id)
    booking = await run_in_threadpool(
        _insert_booking,
        principal.id,
        {"preferred_windows": body.preferred_windows, "topic": body.topic},
    )
    await run_in_threadpool(
        _notify_astrologer,
        user_email=principal.email,
        intake=intake,
        booking=booking,
    )
    return BookingResponse(**booking)


@router.patch(
    "/bookings/{booking_id}/status",
    response_model=BookingResponse,
    dependencies=[Depends(require_myrology_admin)],
)
async def update_booking_status(booking_id: str, body: BookingStatusUpdate) -> BookingResponse:
    """Internal/ops transition of a booking through its lifecycle. Token-guarded
    (X-Myro-Admin-Token) — no end-user principal. Stamps the lifecycle timestamp
    that anchors the terms §07 refund cutoff (done_at = delivered = non-refundable)."""
    row = await run_in_threadpool(_transition_booking, booking_id, body.status)
    logger.info("metric myrology.booking_transition id=%s status=%s", booking_id, body.status)
    return BookingResponse(**row)
