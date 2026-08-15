"""Burst ceilings on anonymous LLM actions."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.security import anon_rate_limit


@pytest.fixture(autouse=True)
def _reset() -> None:
    anon_rate_limit.reset()
    yield
    anon_rate_limit.reset()


def test_rewrite_burst_trips_before_hourly_ceiling() -> None:
    limit = anon_rate_limit.BURST_LIMITS["rewrite"][1]
    for _ in range(limit):
        anon_rate_limit.enforce_anon_rate("rewrite", "1.2.3.4")
    with pytest.raises(HTTPException) as exc:
        anon_rate_limit.enforce_anon_rate("rewrite", "1.2.3.4")
    assert exc.value.status_code == 429


def test_actions_without_burst_only_use_hourly() -> None:
    # job_search has no burst tuple — hourly alone.
    for _ in range(anon_rate_limit.MAX_PER_WINDOW["job_search"]):
        anon_rate_limit.enforce_anon_rate("job_search", "9.9.9.9")
    with pytest.raises(HTTPException):
        anon_rate_limit.enforce_anon_rate("job_search", "9.9.9.9")
