"""Response security headers for the JSON API."""

from __future__ import annotations

from fastapi import FastAPI
from starlette.types import ASGIApp, Message, Receive, Scope, Send

API_CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    )
)

SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "content-security-policy": API_CONTENT_SECURITY_POLICY,
}

_ENCODED_SECURITY_HEADERS = {
    name.encode("ascii"): value.encode("ascii")
    for name, value in SECURITY_HEADERS.items()
}


class SecurityHeadersMiddleware:
    """Attach security policy headers without buffering response bodies."""

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

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                protected_names = set(_ENCODED_SECURITY_HEADERS)
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() not in protected_names
                ]
                headers.extend(_ENCODED_SECURITY_HEADERS.items())
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


def install_security_headers(app: FastAPI) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
