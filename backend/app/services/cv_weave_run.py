"""One weave run per person per job at a time, so a Retry can never pay twice.

The weave is the only charged step and it runs 20–75s; the client stops waiting
on the socket at 60s. Nothing claimed the run, so a second POST while the first
was still working started a second model call and a second 50-coin charge. One
person paid eleven times in 42 seconds on 2026-10-21 (a client that put the
last question back on screen mid-run); the U4 phone run (2026-10-22) found the
same gap behind the Retry a timeout offered.

Claim first: the lease is taken before the cache is read or any model called,
and released when the run ends. A second POST inside it is told the first is
still working (`IN_FLIGHT_CODE`, 409); the GET reports the lease as `weaving`,
so a client that gave up on the socket reads the cache until the proposal
lands or the run ends without one.

The work is bounded by `RUN_SECONDS` and the lease outlives it by the charge and
the cache write, so a slow run cannot outlive its claim and race a successor to
the wallet.

Redis holds the lease. Redis is already a hard dependency of the weave — every
provider call takes a global Provider Budget slot there (ADR-0008) — so a claim
refused during an outage refuses a run that could not have finished.
"""
from __future__ import annotations

from app.services.background import debounce

#: The model work (coverage, brief, stories, the weave) gets this long. Real
#: runs take 20–75s; past this a run is a provider ladder failing tier by tier.
RUN_SECONDS = 240

#: The lease: the work, plus the charge and the cache write after it.
CLAIM_SECONDS = RUN_SECONDS + 60

#: `detail.code` on the 409 a second POST gets while the first is working.
IN_FLIGHT_CODE = "weave_in_flight"


def _key(user_id: str, job_id: str) -> str:
    return f"cv_weave_run:{user_id}:{job_id}"


def claim(user_id: str, job_id: str) -> str | None:
    """The lease token, or None when a run for this job is already working."""
    return debounce.acquire_lease(_key(user_id, job_id), CLAIM_SECONDS)


def release(user_id: str, job_id: str, token: str) -> None:
    debounce.release_lease(_key(user_id, job_id), token)


def in_flight(user_id: str, job_id: str) -> bool:
    return debounce.lease_held(_key(user_id, job_id))
