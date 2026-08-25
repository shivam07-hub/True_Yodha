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

# The sample used to be `list(_slow_events)[-8:]` — "most recent". That is a
# ranking function nobody designed: whatever fires most often takes every slot.
# Over 2026-08-14..24, `POST /partner/v1/sso/session` was 170 of 613 alert lines
# (27.7%) in runs of 4-6 per window, for a partner with a handful of users. Nine
# windows were 100% SSO, and on each of them a stage-one route was also slow and
# never reached the email. ARCHITECTURE_READ_PATH.md S16 P0.
#
# So the sample is stratified: every stage that contributed is represented, and
# a loud stage can occupy at most `_SAMPLE_PER_STAGE` slots. Ordered — first
# matching prefix wins, most specific first. `/jobs/companies/*` is public SEO
# and must be classified before the `/jobs` catch-all; `/jobs/feed` is arrival
# and must be classified before it too.
_JOURNEY_STAGES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("partner", ("/partner",)),
    ("public", ("/public", "/companies", "/jobs/companies", "/comments", "/robots", "/sitemap")),
    (
        "funnel",
        ("/auth", "/cv", "/onboarding", "/roles", "/scores", "/profile",
         "/users/me", "/jobs/feed", "/v1/telemetry"),
    ),
    ("market", ("/jobs", "/home", "/upskilling", "/diary", "/skills", "/notifications",
                "/preflight", "/mentor", "/users")),
)
_SAMPLE_PER_STAGE = 3

# Ranked by how close the stage sits to the goal in CLAUDE.md — understand the
# platform, download the CV. The email leads with the stage that matters most,
# not the one that shouted loudest.
_STAGE_ORDER = ("funnel", "public", "market", "partner", "other")


def _stage_of(path: str) -> str:
    """Which journey stage a path belongs to. First matching prefix wins."""
    for stage, prefixes in _JOURNEY_STAGES:
        if any(path.startswith(prefix) for prefix in prefixes):
            return stage
    return "other"


def _stratified_sample(events: list[tuple[float, str, str, float]]) -> str:
    """Up to `_SAMPLE_PER_STAGE` SLOWEST lines per stage, funnel first.

    Two guarantees, and they are different. Stratifying by stage keeps a stage
    that contributed one slow request visible next to a stage that contributed
    forty. Ranking by duration inside the stage keeps the worst line visible: a
    120s window carries almost no information in recency and a great deal in
    magnitude, and "most recent" hid an 8,322ms `/roles/families` behind a
    1,441ms `/roles/family-locations` in the real 2026-08-18 window.
    """
    grouped: dict[str, list[tuple[float, str, str]]] = {}
    counts: dict[str, int] = {}
    for _, method, path, elapsed in events:
        stage = _stage_of(path)
        counts[stage] = counts.get(stage, 0) + 1
        grouped.setdefault(stage, []).append((elapsed, method, path))

    by_stage: dict[str, list[str]] = {
        stage: [
            f"  {method} {path} {elapsed:.0f}ms"
            for elapsed, method, path in sorted(rows, key=lambda r: -r[0])[:_SAMPLE_PER_STAGE]
        ]
        for stage, rows in grouped.items()
    }

    blocks: list[str] = []
    for stage in _STAGE_ORDER:
        if stage not in by_stage:
            continue
        total = counts[stage]
        shown = len(by_stage[stage])
        header = f"{stage} ({total} slow"
        header += f", showing {shown}):" if shown < total else "):"
        blocks.append(header + "\n" + "\n".join(by_stage[stage]))
    return "\n".join(blocks)


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
        events = list(_slow_events)
        sample = _stratified_sample(events)
        body = (
            f"{len(events)} requests over {SLOW_REQUEST_MS:.0f}ms in the last "
            f"{_ALERT_WINDOW_SECONDS:.0f}s, by journey stage:\n{sample}"
        )
        stage_counts: dict[str, int] = {}
        for _, _, path, _ in events:
            stage = _stage_of(path)
            stage_counts[stage] = stage_counts.get(stage, 0) + 1
        _logger.warning(
            "metric saturation.alert_fired count=%d stages=%s",
            len(events),
            ",".join(f"{k}={stage_counts[k]}" for k in _STAGE_ORDER if k in stage_counts),
        )

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
