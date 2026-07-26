"""Exact-origin CORS policy for the browser-facing API."""

from __future__ import annotations

from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    if not validated:
        raise ValueError("At least one exact CORS origin is required")
    return validated


def install_cors(app: FastAPI, origins: list[str]) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_validated_origins(origins),
        allow_credentials=False,
        allow_methods=_ALLOWED_METHODS,
        allow_headers=_ALLOWED_HEADERS,
        expose_headers=_EXPOSED_HEADERS,
        max_age=600,
    )
