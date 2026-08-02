"""Exact-origin CORS policy for the browser-facing API."""

from __future__ import annotations

import logging
import re
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import Headers
from starlette.responses import Response

_log = logging.getLogger("uvicorn.error")

# Origins a preview-origin pattern must never admit. A regex is only ever a
# convenience for the dev tier; if one of these gets through, the pattern is too
# loose to install at all.
_REGEX_CANARIES = (
    "https://evil.example",
    "https://truemirror.vercel.app.evil.example",
    "https://attacker-truemirror.vercel.app",
    "http://truemirror-preview.vercel.app",
    "https://himyro.com.evil.example",
)

_ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
_ALLOWED_HEADERS = [
    "Accept",
    "Authorization",
    "Content-Type",
    "Idempotency-Key",
    "If-None-Match",
    "Last-Event-ID",
    "X-Myro-CV-Source",
]
_EXPOSED_HEADERS = [
    "ETag",
    "Retry-After",
    "X-Correlation-ID",
    "X-Myro-Error-Code",
    "X-Process-Time",
]


def _validated_origins(origins: list[str]) -> list[str]:
    validated: list[str] = []
    for raw_origin in origins:
        origin = raw_origin.strip()
        if origin == "*":
            raise ValueError("CORS wildcard origins are forbidden")
        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(f"Invalid CORS origin: {origin!r}")
        canonical = f"{parsed.scheme}://{parsed.netloc}"
        if canonical not in validated:
            validated.append(canonical)
    return validated


def _validated_origin_regex(pattern: str) -> str:
    """Accept a preview-origin pattern only if it is anchored and narrow.

    Starlette full-matches this pattern, but the anchors are required anyway so
    the intent is readable at the call site, and every canary is checked so a
    widened pattern fails at boot instead of quietly admitting the internet.
    """
    if not pattern.startswith("^") or not pattern.endswith("$"):
        raise ValueError(f"CORS origin regex must be anchored: {pattern!r}")
    try:
        compiled = re.compile(pattern)
    except re.error as exc:
        raise ValueError(f"Invalid CORS origin regex: {pattern!r}") from exc
    admitted = [origin for origin in _REGEX_CANARIES if compiled.fullmatch(origin)]
    if admitted:
        raise ValueError(
            f"CORS origin regex {pattern!r} is too broad: it admits {admitted}"
        )
    return pattern


class _ObservableCORSMiddleware(CORSMiddleware):
    """CORS, with refusals that leave a trace.

    Starlette answers a preflight it does not like with a bare 400 and logs
    nothing, so a refused browser is indistinguishable in the logs from a
    healthy one — prod showed `OPTIONS /users/me 400` twice with no way to tell
    whether that was an attacker, a stale bookmark, a Vercel preview pointed at
    the prod API, or a shipped client we had just broken. The policy is correct
    and stays exactly as strict; this only names what it turned away, so the
    next unexplained 400 is one grep instead of a guess.
    """

    def preflight_response(self, request_headers: Headers) -> Response:
        response = super().preflight_response(request_headers)
        if response.status_code == 400:
            _log.warning(
                "metric cors.preflight_refused origin=%s method=%s headers=%s",
                request_headers.get("origin", "<none>"),
                request_headers.get("access-control-request-method", "<none>"),
                request_headers.get("access-control-request-headers", "<none>"),
            )
        return response


def install_cors(app: FastAPI, origins: list[str], origin_regex: str = "") -> None:
    """Install the browser-facing CORS policy.

    `origins` is the exact allowlist and is the whole policy in production.
    `origin_regex` additionally admits the dev tier's per-deployment preview
    origins; callers must leave it empty for production (see
    Settings.cors_origin_regex, which enforces that structurally).
    """
    validated_origins = _validated_origins(origins)
    validated_regex = _validated_origin_regex(origin_regex) if origin_regex else None
    if not validated_origins and not validated_regex:
        raise ValueError("At least one exact CORS origin or origin regex is required")
    app.add_middleware(
        _ObservableCORSMiddleware,
        allow_origins=validated_origins,
        allow_origin_regex=validated_regex,
        allow_credentials=False,
        allow_methods=_ALLOWED_METHODS,
        allow_headers=_ALLOWED_HEADERS,
        expose_headers=_EXPOSED_HEADERS,
        max_age=600,
    )
