"""API error boundary with correlation IDs and leak-safe client responses."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .headers import SECURITY_HEADERS
from .redaction import redact_sensitive_text

_log = logging.getLogger(__name__)

CORRELATION_HEADER = "x-correlation-id"
GENERIC_SERVER_ERROR = "Something went wrong. Please try again."
GENERIC_VALIDATION_ERROR = "Request validation failed."
GENERIC_CLIENT_ERROR = "The request could not be completed."

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


def _public_http_detail(exc: StarletteHTTPException) -> Any:
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
    _exc: RequestValidationError,
) -> JSONResponse:
    return _response(
        request=request,
        status_code=422,
        detail=GENERIC_VALIDATION_ERROR,
    )


async def _unhandled_exception_handler(
    request: Request,
    _exc: Exception,
) -> JSONResponse:
    correlation_id = _correlation_id(request)
    _log.exception(
        "Unhandled request error correlation_id=%s method=%s path=%s",
        correlation_id,
        request.method,
        request.url.path,
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
    app.add_exception_handler(Exception, _unhandled_exception_handler)
