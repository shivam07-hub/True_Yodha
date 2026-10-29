"""One paid run per person per job per artifact at a time, so a Retry can never pay twice.

Three routes build a paid artifact with a model and charge on delivery: the
weave (50), the outreach pack (50) and the day-of brief (30). Each runs a
provider ladder that can outlast the client's socket — every attempt may take
45s and the client stops waiting at 60s — and nothing claimed the run, so a
second POST while the first was still working started a second model call and
a second charge. One person paid for the weave eleven times in 42 seconds on
2026-10-21; the U4 phone run (2026-10-22) found the same gap behind the Retry a
timeout offered, and the pack and the brief carried it too.

Claim first: `held` takes the lease before the cache is read or any model
called, and releases it when the run ends. A second POST inside it is told the
first is still working (`IN_FLIGHT_CODE`, 409); each route's GET reports
`in_flight` (the weave's `weaving`, the pack's and the brief's `building`), so a
client that gave up on the socket reads the cache until the artifact lands or
the run ends without one.

The work is bounded by `RUN_SECONDS` and the lease outlives it by the charge and
the cache write, so a slow run cannot outlive its claim and race a successor to
the wallet.

Redis holds the lease. Redis is already a hard dependency of these runs — every
provider call takes a global Provider Budget slot there (ADR-0008) — so a claim
refused during an outage refuses a run that could not have finished.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Iterator
from contextlib import contextmanager
from typing import TypeVar

from fastapi import HTTPException, status

from app.services.background import debounce
from app.services.deepening_keys import DeepeningKey

logger = logging.getLogger(__name__)

T = TypeVar("T")

#: The model work gets this long. Real runs take 20–75s; past this a run is a
#: provider ladder failing tier by tier.
RUN_SECONDS = 240

#: The lease: the work, plus the charge and the cache write after it.
CLAIM_SECONDS = RUN_SECONDS + 60

#: `detail.code` on the 409 a second POST gets while the first is working.
IN_FLIGHT_CODE = "run_in_flight"


def _key(user_id: str, job_id: str, artifact: DeepeningKey) -> str:
    return f"{artifact.value}_run:{user_id}:{job_id}"


@contextmanager
def held(user_id: str, job_id: str, artifact: DeepeningKey, message: str) -> Iterator[None]:
    """Hold this run's claim for the body, or refuse with the in-flight 409."""
    token = debounce.acquire_lease(_key(user_id, job_id, artifact), CLAIM_SECONDS)
    if token is None:
        logger.info(
            "metric paid_run.in_flight artifact=%s user=%s job=%s", artifact.value, user_id, job_id,
        )
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": IN_FLIGHT_CODE, "message": message})
    try:
        yield
    finally:
        debounce.release_lease(_key(user_id, job_id, artifact), token)


def in_flight(user_id: str, job_id: str, artifact: DeepeningKey) -> bool:
    return debounce.lease_held(_key(user_id, job_id, artifact))


async def bounded(
    work: Awaitable[T], user_id: str, job_id: str, artifact: DeepeningKey,
) -> T | None:
    """The model work, or None when it outran `RUN_SECONDS` — so it can never
    outlive its claim. None is the route's "nothing to deliver, no charge"."""
    try:
        async with asyncio.timeout(RUN_SECONDS):
            return await work
    except TimeoutError:
        logger.warning(
            "metric paid_run.run_timeout artifact=%s user=%s job=%s", artifact.value, user_id, job_id,
        )
        return None
