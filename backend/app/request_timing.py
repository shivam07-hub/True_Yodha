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

import asyncio
import logging
import time
from collections import deque

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_logger = logging.getLogger("app.request_timing")

# Requests slower than this log a structured warning. The product target is
# <1s end-to-end; 1000ms of pure backend time is already over budget once
# network + render are added, so we flag at it.
SLOW_REQUEST_MS = 1000.0

# Backlog #16: a single slow request is noise (one heavy company page, one
# cold cache). A BURST is the signal worth waking someone for — the prod
# incident that named this backlog was 8 unrelated endpoints landing
# together at the 8s timeout. Threshold tuned to that shape: 5 slow
# requests inside 2 minutes. Cooldown keeps a sustained bad period from
# spamming — one email per 30 min, not one per request.
_ALERT_WINDOW_SECONDS = 120.0
_ALERT_THRESHOLD = 5
_ALERT_COOLDOWN_SECONDS = 1800.0

_slow_events: deque[tuple[float, str, str, float]] = deque()
_last_alert_at = 0.0


def _maybe_alert_saturation(method: str, path: str, elapsed_ms: float) -> None:
    """Fire-and-forget email when slow requests cluster into a burst. Never
    raises — a broken alert path must not break the request it's timing.
    """
    global _last_alert_at
    try:
        from app.config import settings

        now = time.time()
        _slow_events.append((now, method, path, elapsed_ms))
        while _slow_events and now - _slow_events[0][0] > _ALERT_WINDOW_SECONDS:
            _slow_events.popleft()

        if len(_slow_events) < _ALERT_THRESHOLD:
            return
        if now - _last_alert_at < _ALERT_COOLDOWN_SECONDS:
            return

        recipient = settings.ops_alert_email.strip()
        if not recipient:
            _logger.warning("metric saturation.alert_skipped reason=no_recipient")
            return

        _last_alert_at = now  # claim before dispatch — never double-fire concurrently
        sample = "\n".join(
            f"  {m} {p} {t:.0f}ms" for _, m, p, t in list(_slow_events)[-8:]
        )
        body = (
            f"{len(_slow_events)} requests over {SLOW_REQUEST_MS:.0f}ms in the last "
            f"{_ALERT_WINDOW_SECONDS:.0f}s. Most recent:\n{sample}"
        )
        _logger.warning("metric saturation.alert_fired count=%d", len(_slow_events))

        def _send() -> None:
            from app.services.email_service import send_email

            send_email(
                to=recipient,
                subject="Myro backend: read-latency saturation",
                text=body,
            )

        loop = asyncio.get_running_loop()
        loop.run_in_executor(None, _send)
    except Exception:  # pragma: no cover — alerting must never break the request
        _logger.exception("saturation alert path failed")


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
                    _maybe_alert_saturation(method, path, elapsed_ms)
            await send(message)

        await self.app(scope, receive, send_with_timing)
