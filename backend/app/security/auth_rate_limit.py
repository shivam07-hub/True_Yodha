"""Distributed per-IP limits for unauthenticated authentication endpoints."""

from __future__ import annotations

import hashlib
import ipaddress
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import settings

from .error_handling import CORRELATION_HEADER

_log = logging.getLogger(__name__)

_INCREMENT_LUA = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
"""


@dataclass(frozen=True)
class _Limit:
    name: str
    attempts: int
    window_seconds: int


_AUTH_LIMITS = {
    "/auth/login": _Limit("login", attempts=5, window_seconds=60),
    "/auth/signup": _Limit("signup", attempts=5, window_seconds=60),
    # Magic link is both passwordless OTP and the canonical account-recovery
    # flow, so it receives the stricter password-reset minimum.
    "/auth/magic-link-request": _Limit(
        "magic_link",
        attempts=3,
        window_seconds=60 * 60,
    ),
}

_redis_client: Any = None


def _get_redis() -> Any:
    global _redis_client
    if _redis_client is None:
        from redis.asyncio import Redis

        _redis_client = Redis.from_url(
            settings.redis_url.strip(),
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _redis_client


def _valid_ip(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def client_ip_from_scope(scope: Scope) -> str:
    headers = {
        name.decode("latin-1").lower(): value.decode("latin-1")
        for name, value in scope.get("headers", [])
    }
    forwarded = headers.get("x-forwarded-for", "")
    # The right-most address is the one appended by the trusted ingress proxy;
    # using the attacker-controlled left-most value makes the limit bypassable.
    if forwarded:
        resolved = _valid_ip(forwarded.split(",")[-1])
        if resolved:
            return resolved
    resolved = _valid_ip(headers.get("x-real-ip"))
    if resolved:
        return resolved
    client = scope.get("client")
    if client:
        resolved = _valid_ip(client[0])
        if resolved:
            return resolved
    return "0.0.0.0"


def _rate_key(policy: _Limit, ip: str) -> str:
    digest = hashlib.sha256(ip.encode("utf-8")).hexdigest()
    return f"auth:rate:{policy.name}:{digest}"


def _correlation_id(scope: Scope) -> str:
    state = scope.setdefault("state", {})
    existing = state.get("correlation_id")
    if isinstance(existing, str) and existing:
        return existing
    correlation_id = uuid4().hex
    state["correlation_id"] = correlation_id
    return correlation_id


async def _send_error(
    scope: Scope,
    receive: Receive,
    send: Send,
    *,
    status_code: int,
    detail: str,
    retry_after: int | None = None,
) -> None:
    correlation_id = _correlation_id(scope)
    headers = {CORRELATION_HEADER: correlation_id}
    if retry_after is not None:
        headers["Retry-After"] = str(max(1, retry_after))
    response = JSONResponse(
        status_code=status_code,
        content={"detail": detail, "correlation_id": correlation_id},
        headers=headers,
    )
    await response(scope, receive, send)


class AuthRateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        redis_provider: Callable[[], Any] = _get_redis,
        production: bool | None = None,
    ) -> None:
        self.app = app
        self.redis_provider = redis_provider
        self.production = settings.is_production if production is None else production

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        policy = _AUTH_LIMITS.get(scope.get("path", ""))
        if policy is None:
            await self.app(scope, receive, send)
            return

        ip = client_ip_from_scope(scope)
        key = _rate_key(policy, ip)
        try:
            current, ttl = await self.redis_provider().eval(
                _INCREMENT_LUA,
                1,
                key,
                policy.window_seconds,
            )
        except Exception as exc:
            _log.error(
                "Auth rate limiter unavailable endpoint=%s reason=%s",
                policy.name,
                type(exc).__name__,
            )
            if self.production:
                await _send_error(
                    scope,
                    receive,
                    send,
                    status_code=503,
                    detail="Authentication is temporarily unavailable.",
                )
                return
            await self.app(scope, receive, send)
            return

        if int(current) > policy.attempts:
            retry_after = int(ttl) if int(ttl) > 0 else policy.window_seconds
            _log.warning(
                "Auth rate limit reached endpoint=%s client=%s",
                policy.name,
                hashlib.sha256(ip.encode("utf-8")).hexdigest()[:12],
            )
            await _send_error(
                scope,
                receive,
                send,
                status_code=429,
                detail="Too many attempts. Try again later.",
                retry_after=retry_after,
            )
            return

        await self.app(scope, receive, send)


def install_auth_rate_limits(
    app: FastAPI,
    *,
    redis_provider: Callable[[], Any] = _get_redis,
    production: bool | None = None,
) -> None:
    app.add_middleware(
        AuthRateLimitMiddleware,
        redis_provider=redis_provider,
        production=production,
    )
