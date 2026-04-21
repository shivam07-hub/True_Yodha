"""
deps.py
FastAPI shared dependencies.

get_current_user — validates Bearer JWT via Supabase Auth.
Returns {"user_id": str, "email": str, "token": str}.
Use as a route dependency on any protected endpoint.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import get_supabase

_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    import logging
    logger = logging.getLogger(__name__)
    token = credentials.credentials
    try:
        response = get_supabase().auth.get_user(token)
        if not response.user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {
            "user_id": response.user.id,
            "email": response.user.email,
            "token": token,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token validation failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
