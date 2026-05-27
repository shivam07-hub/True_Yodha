"""Post-unlock Myrology surface: birth-details intake + session booking requests.

Gated behind the ₹499 entitlement (user_profiles.myrology_unlocked). Writes use
the service-role admin client — the tables expose SELECT-own RLS only. Booking
requests are emailed to the in-house astrologer for manual confirm; the email is
best-effort and never blocks the durable booking row.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.schemas.myrology import (
    BookingListResponse,
    BookingRequest,
    BookingResponse,
    IntakeRequest,
    IntakeResponse,
)
from app.services import email_service

router = APIRouter(prefix="/myrology", tags=["myrology"])
logger = logging.getLogger(__name__)


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
    await run_in_threadpool(_require_unlocked, principal.id)
    row = await run_in_threadpool(_fetch_intake, principal.id)
    if not row:
        return None
    return IntakeResponse(**row)


@router.post("/intake", response_model=IntakeResponse)
async def save_intake(
    body: IntakeRequest,
    principal: Principal = Depends(get_principal),
) -> IntakeResponse:
    await run_in_threadpool(_require_unlocked, principal.id)
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
