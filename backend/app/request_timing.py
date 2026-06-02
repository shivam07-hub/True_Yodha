"""Server-side request timing middleware.

Measures wall-clock time for every request, attaches it as the
``X-Process-Time`` response header (milliseconds), and logs a structured
warning when a request crosses the slow threshold. This is how we *prove*
the <1s target rather than assume it — grep the logs for ``metric route.slow``
and the per-route timing surfaces immediately.

Pairs with the client-reported ``/v1/telemetry/route-perf`` endpoint: that
captures perceived (browser) latency, this captures real backend latency.
"""

from __future__ import annotations

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_logger = logging.getLogger("app.request_timing")

# Requests slower than this log a structured warning. The product target is
# <1s end-to-end; 1000ms of pure backend time is already over budget once
# network + render are added, so we flag at it.
SLOW_REQUEST_MS = 1000.0


class RequestTimingMiddleware:
    """Pure-ASGI timing middleware. Adds X-Process-Time (ms) and warns on slow
    requests. ASGI (not BaseHTTPMiddleware) so it never buffers streaming
    responses — the SSE analyse/stream endpoints keep streaming untouched.
    """

    def __init__(self, app: ASGIApp, slow_ms: float = SLOW_REQUEST_MS) -> None:
        self.app = app
        self.slow_ms = slow_ms

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()

        async def send_with_timing(message: Message) -> None:
            if message["type"] == "http.response.start":
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                headers = message.setdefault("headers", [])
                headers.append(
                    (b"x-process-time", f"{elapsed_ms:.1f}".encode("latin-1"))
                )
                if elapsed_ms >= self.slow_ms:
                    method = scope.get("method", "?")
                    path = scope.get("path", "?")
                    status = message.get("status", 0)
                    _logger.warning(
                        "metric route.slow method=%s path=%s status=%s ms=%.1f",
                        method,
                        path,
                        status,
                        elapsed_ms,
                    )
            await send(message)

        await self.app(scope, receive, send_with_timing)
