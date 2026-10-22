"""API error boundary with correlation IDs and leak-safe client responses."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any
from uuid import uuid4

import httpx

from fastapi import FastAPI, Request
from postgrest.exceptions import APIError
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .headers import SECURITY_HEADERS
from .redaction import redact_sensitive_text
from app.notice import Sighting, observe
from app.services.read_capacity import ReadCapacityExceeded

_log = logging.getLogger(__name__)

CORRELATION_HEADER = "x-correlation-id"
GENERIC_SERVER_ERROR = "Something went wrong. Please try again."
GENERIC_VALIDATION_ERROR = "Request validation failed."
GENERIC_CLIENT_ERROR = "The request could not be completed."
READ_CAPACITY_DETAIL = "We are refreshing your latest data. Please try again in a moment."
UPSTREAM_TIMEOUT_DETAIL = "That took longer than expected. Please try again."

_INTERNAL_DETAIL_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\btraceback\b",
        r"\b(?:select|insert|update|delete|alter|drop|create)\s+.+\b(?:from|into|table|where)\b",
        r"\b(?:psycopg|postgrest|asyncpg|sqlalchemy|supabase)\b",
        r"\b(?:exception|runtimeerror|valueerror|keyerror|typeerror):",
        r'\bfile\s+"[^"]+",\s+line\s+\d+',
        r"(?:^|[\s\"'(])/(?:app|home|users|var|srv|opt|private|tmp)/[\w./-]+",
        r"[a-z]:\\(?:users|windows|program files)\\",
    )
)


class CorrelationIdMiddleware:
    """Attach an opaque request ID without buffering streaming responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self,
        scope: Scope,
        receive: Receive,
        send: Send,
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        correlation_id = uuid4().hex
        scope.setdefault("state", {})["correlation_id"] = correlation_id

        async def send_with_correlation_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() != CORRELATION_HEADER.encode("ascii")
                ]
                headers.append(
                    (
                        CORRELATION_HEADER.encode("ascii"),
                        correlation_id.encode("ascii"),
                    )
                )
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_correlation_id)


def _correlation_id(request: Request) -> str:
    correlation_id = getattr(request.state, "correlation_id", None)
    if isinstance(correlation_id, str) and correlation_id:
        return correlation_id
    return uuid4().hex


def _contains_internal_detail(value: Any) -> bool:
    if isinstance(value, str):
        redacted = redact_sensitive_text(value)
        return redacted != value or any(
            pattern.search(redacted) for pattern in _INTERNAL_DETAIL_PATTERNS
        )
    if isinstance(value, Mapping):
        return any(
            _contains_internal_detail(key) or _contains_internal_detail(item)
            for key, item in value.items()
        )
    if isinstance(value, (list, tuple)):
        return any(_contains_internal_detail(item) for item in value)
    return False


class ServiceUnavailable(StarletteHTTPException):
    """A 503 whose detail was written for the person reading it.

    The boundary blanks every 5xx detail, because a 5xx usually carries an
    exception's text. A deliberate "not right now" is the case it must not
    blank: the copy is authored and says what to do next. A weave that found
    nothing to deliver told the person "Something went wrong" instead of "you
    were not charged" (U4 phone run, 2026-10-22).
    """

    def __init__(self, detail: str, *, headers: Mapping[str, str] | None = None) -> None:
        super().__init__(status_code=503, detail=detail, headers=dict(headers) if headers else None)


def _public_http_detail(exc: StarletteHTTPException) -> Any:
    if isinstance(exc, ServiceUnavailable) and not _contains_internal_detail(exc.detail):
        return exc.detail
    if exc.status_code >= 500 or _contains_internal_detail(exc.detail):
        return (
            GENERIC_SERVER_ERROR
            if exc.status_code >= 500
            else GENERIC_CLIENT_ERROR
        )
    return exc.detail


def _response(
    *,
    request: Request,
    status_code: int,
    detail: Any,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    correlation_id = _correlation_id(request)
    response_headers = {**dict(headers or {}), **SECURITY_HEADERS}
    response_headers[CORRELATION_HEADER] = correlation_id
    return JSONResponse(
        status_code=status_code,
        content={"detail": detail, "correlation_id": correlation_id},
        headers=response_headers,
    )


async def _http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    return _response(
        request=request,
        status_code=exc.status_code,
        detail=_public_http_detail(exc),
        headers=exc.headers,
    )


async def _validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    # The client gets nothing, so the log carries WHERE and WHICH RULE — never
    # the value. A stale cap rejecting a fourth city read as a bare "422" here.
    fields = ",".join(
        ".".join(str(part) for part in error.get("loc", ())) + f":{error.get('type', '')}"
        for error in exc.errors()[:5]
    )
    _log.warning(
        "metric request.validation_failed method=%s path=%s fields=%s",
        request.method,
        request.url.path,
        redact_sensitive_text(fields),
    )
    return _response(
        request=request,
        status_code=422,
        detail=GENERIC_VALIDATION_ERROR,
    )


async def _read_capacity_exceeded_handler(
    request: Request,
    exc: ReadCapacityExceeded,
) -> JSONResponse:
    _log.warning(
        "metric read_capacity.rejected method=%s path=%s",
        request.method,
        request.url.path,
    )
    observe(
        Sighting.read_capacity(
            correlation_id=_correlation_id(request),
            method=request.method,
            path=request.url.path,
        )
    )
    return _response(
        request=request,
        status_code=503,
        detail=READ_CAPACITY_DETAIL,
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


async def _upstream_timeout_handler(
    request: Request,
    _exc: httpx.TimeoutException,
) -> JSONResponse:
    """A Supabase read that outran the PostgREST ceiling is a known, bounded
    failure — not a crash.

    `_POSTGREST_TIMEOUT_SECONDS` exists precisely so one slow query cannot hold
    a request thread forever, but nothing classified the exception it throws, so
    every trip of that ceiling reached the unhandled handler: a 500 plus a full
    httpcore traceback in the logs. That is how the `/companies/*` timeouts read
    as a transport crash for weeks. Same shape as read-capacity rejection —
    upstream is saturated or the query is too heavy — so it gets the same
    honest 503 + Retry-After, and one greppable metric line instead of a stack.
    """
    _log.warning(
        "metric upstream.read_timeout method=%s path=%s",
        request.method,
        request.url.path,
    )
    observe(
        Sighting.upstream_timeout(
            correlation_id=_correlation_id(request),
            method=request.method,
            path=request.url.path,
        )
    )
    return _response(
        request=request,
        status_code=503,
        detail=UPSTREAM_TIMEOUT_DETAIL,
        headers={"Retry-After": "2"},
    )


_STATEMENT_TIMEOUT = "57014"


async def _postgrest_error_handler(request: Request, exc: APIError) -> JSONResponse:
    """A statement timeout is the database-side twin of an httpx read timeout.

    PostgREST raises it as a plain APIError, so it reached the unhandled
    boundary: a 500, and an `unhandled_500` Notice keyed to whichever call site
    the slow query happened to run from. Four such one-offs landed in one
    capacity storm (2026-09-12/13), each looking like its own bug. It gets the
    same honest 503 + Retry-After as the read timeout, under its own limiter.
    Every other PostgREST error is still an unhandled 500.
    """
    if getattr(exc, "code", None) != _STATEMENT_TIMEOUT:
        return await _unhandled_exception_handler(request, exc)
    _log.warning(
        "metric db.statement_timeout method=%s path=%s",
        request.method,
        request.url.path,
    )
    observe(
        Sighting.statement_timeout(
            correlation_id=_correlation_id(request),
            method=request.method,
            path=request.url.path,
        )
    )
    return _response(
        request=request,
        status_code=503,
        detail=UPSTREAM_TIMEOUT_DETAIL,
        headers={"Retry-After": "2"},
    )


def _relabelled_timeout(exc: BaseException) -> httpx.TimeoutException | None:
    """The transport timeout a client library re-raised as its own error.

    gotrue catches every transport failure and raises `AuthRetryableError`
    carrying the same message, so an auth call that timed out inside a
    database stall (2026-10-16 15:33, partner SSO) reached this boundary as an
    auth bug. One link back, and only when the wrapper says exactly what the
    timeout said — a different error raised while handling a timeout is a bug
    of its own. No auth error class is imported: it has moved packages before
    (see `auth_links`).
    """
    link = exc.__cause__ or exc.__context__
    if isinstance(link, httpx.TimeoutException) and str(exc) == str(link):
        return link
    return None


async def _unhandled_exception_handler(
    request: Request,
    _exc: Exception,
) -> JSONResponse:
    timeout = _relabelled_timeout(_exc)
    if timeout is not None:
        return await _upstream_timeout_handler(request, timeout)
    correlation_id = _correlation_id(request)
    _log.exception(
        "Unhandled request error correlation_id=%s method=%s path=%s",
        correlation_id,
        request.method,
        request.url.path,
    )
    observe(
        Sighting.unhandled_500(
            exc=_exc,
            correlation_id=correlation_id,
            method=request.method,
            path=request.url.path,
        )
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": GENERIC_SERVER_ERROR,
            "correlation_id": correlation_id,
        },
        headers={**SECURITY_HEADERS, CORRELATION_HEADER: correlation_id},
    )


def install_error_handling(app: FastAPI) -> None:
    """Install the error boundary before the application begins serving."""

    app.add_middleware(CorrelationIdMiddleware)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(ReadCapacityExceeded, _read_capacity_exceeded_handler)
    app.add_exception_handler(httpx.TimeoutException, _upstream_timeout_handler)
    app.add_exception_handler(APIError, _postgrest_error_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
