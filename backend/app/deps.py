"""
deps.py
FastAPI shared dependencies.

get_current_user — validates Bearer JWT via Supabase Auth and lazily provisions
a user_profiles row from JWT claims if missing.
Returns {"user_id": str, "email": str, "token": str}.
Use as a route dependency on any protected endpoint.
"""

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import get_supabase, get_supabase_admin

_bearer = HTTPBearer()
_logger = logging.getLogger(__name__)

# Per-process cache of user_ids whose profile row we've already ensured this
# session. Avoids a round-trip on every authenticated request.
_provisioned_users: set[str] = set()


def _ensure_profile_provisioned(user_id: str, email: str | None, full_name: str | None) -> None:
    """Idempotent INSERT ... ON CONFLICT DO NOTHING on user_profiles. Fails open."""
    if user_id in _provisioned_users or not email:
        return
    try:
        get_supabase_admin().table("user_profiles").upsert(
            {"id": user_id, "email": email, "full_name": full_name},
            on_conflict="id",
            ignore_duplicates=True,
        ).execute()
        _provisioned_users.add(user_id)
    except Exception as exc:
        # Profile provisioning must never block an authenticated request — log
        # and continue. The endpoint itself will surface 404 if needed.
        _logger.warning("Auto-provision failed for user %s: %s: %s", user_id, type(exc).__name__, exc)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    token = credentials.credentials
    try:
        response = get_supabase().auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        full_name = None
        metadata = response.user.user_metadata or {}
        if isinstance(metadata, dict):
            full_name = metadata.get("full_name") or metadata.get("name")
        _ensure_profile_provisioned(response.user.id, response.user.email, full_name)
        return {
            "user_id": response.user.id,
            "email": response.user.email,
            "token": token,
        }
    except HTTPException:
        raise
    except Exception as exc:
        _logger.warning("Token validation failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
