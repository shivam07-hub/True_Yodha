"""Newsletter subscription endpoint.

The EmailSubscribe widget was UI-only — this persists opt-ins to
`newsletter_subscribers`. Public (no auth required); user_id is attached
when an authenticated token is present. Re-subscribing the same email is
idempotent. 10 inserts/hour/IP guards against spray-style garbage.
"""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from typing import Literal

from app.database import get_supabase, get_supabase_admin

router = APIRouter(prefix="/newsletter", tags=["newsletter"])

_bearer = HTTPBearer(auto_error=False)
_log = logging.getLogger(__name__)

_IP_RATE_LIMIT = 10  # inserts / hour / IP

NewsletterSource = Literal["web", "landing", "newsletter_page", "app"]


class SubscribeRequest(BaseModel):
    email: EmailStr
    source: NewsletterSource = "web"


class SubscribeResponse(BaseModel):
    ok: bool
    already_subscribed: bool = False


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else "0.0.0.0"


def _resolve_user_id(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if not credentials:
        return None
    try:
        response = get_supabase().auth.get_user(credentials.credentials)
        return response.user.id if response.user else None
    except Exception:
        return None


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    body: SubscribeRequest,
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> SubscribeResponse:
    email = body.email.strip().lower()
    ip = _client_ip(request)
    admin = get_supabase_admin()

    # IP rate-limit — count inserts from this IP in the last hour.
    try:
        rl = admin.rpc(
            "count_newsletter_attempts_ip", {"p_ip": ip, "p_minutes": 60}
        ).execute()
        if (rl.data or 0) >= _IP_RATE_LIMIT:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many subscribe attempts. Try again later.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Rate-check failure must not block a legitimate subscribe.
        _log.warning("newsletter rate check failed for ip=%s: %s", ip, exc)

    # Idempotent on lower(email): a duplicate is a success, not an error.
    existing = (
        admin.table("newsletter_subscribers")
        .select("id, status")
        .eq("email", email)
        .limit(1)
        .execute()
    )
    if existing.data:
        return SubscribeResponse(ok=True, already_subscribed=True)

    row: dict = {
        "email": email,
        "source": body.source,
        "ip": ip,
        "user_agent": request.headers.get("user-agent"),
    }
    user_id = _resolve_user_id(credentials)
    if user_id:
        row["user_id"] = user_id

    try:
        result = admin.table("newsletter_subscribers").insert(row).execute()
    except Exception as exc:
        # Lost the race on the unique index — someone inserted the same
        # email between our check and insert. Treat as already subscribed.
        if _is_unique_violation(exc):
            return SubscribeResponse(ok=True, already_subscribed=True)
        _log.warning("newsletter insert failed for %s: %s", email, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not subscribe. Try again.",
        )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not subscribe. Try again.",
        )

    return SubscribeResponse(ok=True)


def _is_unique_violation(exc: Exception) -> bool:
    text = str(exc).lower()
    return "duplicate key" in text or "23505" in text or "already exists" in text
