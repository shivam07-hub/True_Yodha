"""Server-side request timing middleware.

Measures wall-clock time for every request, attaches it as the
``X-Process-Time`` response header (milliseconds), and logs a structured
warning when a request crosses the slow threshold. Grep ``metric route.slow``.

Slow 2xx responses open a Notice by kind, never by route: over-budget reads
are ``slow_200:reads_over_budget``; a slow 200 inside budget is a capacity
queue victim (``blocked``).
"""

from __future__ import annotations

import logging
import time

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app import route_latency
from app.services import read_budget
from app.notice import Sighting, observe

_logger = logging.getLogger("app.request_timing")

# The product target is <1s end-to-end; 1000ms of pure backend time is already
# over budget once network + render are added, so we flag at it.
SLOW_REQUEST_MS = 1000.0


def _route_label(scope: Scope) -> str:
    """The router's template, or the raw path when nothing matched.

    Starlette puts the matched route on the scope during routing, which has
    finished by the time the response starts. A 404 never matches, so it keeps
    its raw path — bounded by `route_latency.MAX_TRACKED_ROUTES`.
    """
    route = scope.get("route")
    template = getattr(route, "path", None)
    return str(template or scope.get("path", "?"))


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
        read_token = read_budget.begin()

        async def send_with_timing(message: Message) -> None:
            if message["type"] == "http.response.start":
                elapsed_ms = (time.perf_counter() - start) * 1000.0
                headers = message.setdefault("headers", [])
                headers.append(
                    (b"x-process-time", f"{elapsed_ms:.1f}".encode("latin-1"))
                )
                reads = read_budget.current_count()
                method = scope.get("method", "?")
                path = scope.get("path", "?")
                # Every response, not just the slow ones: a route drifting from
                # 200ms to 900ms never trips the threshold below, and the read
                # contract is a p95, which a tail count cannot answer. Keyed on
                # the route TEMPLATE the router resolved — the raw path would
                # make `/jobs/{id}` a new series per job.
                route_latency.record(str(method), _route_label(scope), elapsed_ms)
                if reads > read_budget.READ_BUDGET_PER_REQUEST:
                    _logger.warning(
                        "metric reads.over_budget method=%s path=%s reads=%d budget=%d ms=%.1f",
                        method,
                        path,
                        reads,
                        read_budget.READ_BUDGET_PER_REQUEST,
                        elapsed_ms,
                    )
                if elapsed_ms >= self.slow_ms:
                    status = message.get("status", 0)
                    _logger.warning(
                        "metric route.slow method=%s path=%s status=%s ms=%.1f reads=%d",
                        method,
                        path,
                        status,
                        elapsed_ms,
                        reads,
                    )
                    if 200 <= int(status) < 300:
                        kind = (
                            "reads_over_budget"
                            if reads > read_budget.READ_BUDGET_PER_REQUEST
                            else "capacity_queue"
                        )
                        observe(
                            Sighting.slow_200(kind=kind, method=str(method), path=str(path))
                        )
            await send(message)

        try:
            await self.app(scope, receive, send_with_timing)
        finally:
            read_budget.end(read_token)
