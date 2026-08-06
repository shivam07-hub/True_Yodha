"""Partner API authentication — bearer API key → scoped partner credential.

A partner key is NOT a user token. It never reaches PostgREST and it never
carries RLS: every partner route runs on the service-role client behind an
explicit `partner_id` filter, so the scope check here is the only thing standing
between one partner and another's roster. Treat a missing `require_scope` on a
new route as a data-leak bug, not a style issue.

Rate limiting mirrors `auth_rate_limit`: Redis counter per key, and in production
a limiter outage fails CLOSED. `POST /partner/v1/sso/session` mints sign-in
sessions — the same class of surface as `/auth/magic-link-request`, which already
refuses to serve prod traffic it cannot count.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import get_supabase_admin
from app.repositories.partners import PartnerCredential, PartnersRepository

logger = logging.getLogger(__name__)

# Scopes a key can carry. Narrow on purpose — a partner that only receives job
# events should not hold a key that can mint sessions.
SCOPE_SSO = "sso"
SCOPE_JOBS_READ = "jobs.read"
SCOPE_WEBHOOKS_MANAGE = "webhooks.manage"
ALL_SCOPES = (SCOPE_SSO, SCOPE_JOBS_READ, SCOPE_WEBHOOKS_MANAGE)

# Per-key ceiling. Generous for an integration that syncs a roster, low enough
# that a leaked key cannot enumerate sessions at speed.
_RATE_LIMIT_REQUESTS = 600
_RATE_WINDOW_SECONDS = 60

_INCREMENT_LUA = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
"""

_bearer = HTTPBearer(auto_error=False)
_redis_client: Any = None


def _get_redis() -> Any:
    global _redis_client
    if _redis_client is None:
        from redis import Redis

        _redis_client = Redis.from_url(
            settings.redis_url.strip(),
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _redis_client


def _enforce_rate_limit(key_id: str) -> None:
    if not settings.redis_url.strip():
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Partner API is temporarily unavailable.",
            )
        return
    try:
        current = _get_redis().eval(
            _INCREMENT_LUA, 1, f"partner:rate:{key_id}", _RATE_WINDOW_SECONDS
        )
    except Exception as exc:  # noqa: BLE001 — classified: outage, not a limit hit
        logger.error("Partner rate limiter unavailable reason=%s", type(exc).__name__)
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Partner API is temporarily unavailable.",
            ) from exc
        return
    if int(current) > _RATE_LIMIT_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded for this API key.",
            headers={"Retry-After": str(_RATE_WINDOW_SECONDS)},
        )


def get_partner_credential(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> PartnerCredential:
    """Resolve `Authorization: Bearer <api key>` to a live partner credential.

    Every failure — absent header, unknown prefix, wrong secret, revoked key,
    suspended partner — returns the same 401, so the response cannot be used to
    learn which keys exist.
    """
    if credentials is None or not (credentials.credentials or "").strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing partner API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    repo = PartnersRepository(get_supabase_admin())
    credential = repo.resolve_credential(credentials.credentials.strip())
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid partner API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _enforce_rate_limit(credential.key_id)
    repo.touch_key(credential.key_id)
    request.state.partner_slug = credential.slug
    return credential


def require_scope(scope: str) -> Any:
    """Dependency factory: the key must carry `scope` or the route 403s."""

    def _dependency(
        credential: PartnerCredential = Depends(get_partner_credential),
    ) -> PartnerCredential:
        if not credential.has_scope(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This API key does not carry the '{scope}' scope.",
            )
        return credential

    return _dependency
