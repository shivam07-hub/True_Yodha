"""Named Job Refresh failures. Invariant 4: never surface str(exc)."""

from __future__ import annotations

import logging
from typing import Literal

import httpx

from app.services.job_refresh.types import SEARCH_FAILED, SEARCH_TIMED_OUT

RefreshFailureKind = Literal["timeout", "pipeline"]

_log = logging.getLogger(__name__)


def classify(exc: BaseException) -> tuple[RefreshFailureKind, str]:
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return "timeout", SEARCH_TIMED_OUT
    return "pipeline", SEARCH_FAILED


def record(
    exc: BaseException,
    *,
    user_id: str,
    ticket_id: str,
    attempt: int,
) -> tuple[RefreshFailureKind, str]:
    kind, message = classify(exc)
    _log.exception(
        "Job refresh failed user=%s ticket=%s attempt=%s kind=%s",
        user_id,
        ticket_id,
        attempt,
        kind,
    )
    _log.warning(
        "metric job_refresh.fail kind=%s attempt=%s exc=%s user=%s ticket=%s",
        kind,
        attempt,
        type(exc).__name__,
        user_id,
        ticket_id,
    )
    return kind, message
