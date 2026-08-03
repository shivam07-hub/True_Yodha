"""Job Runner entrypoint (ADR-0008).

A worker process, separate from the web process, that drains the Work Lanes
fast-first. Run >=2 replicas for redundancy. Start with:

    python -m app.workers.jobs_compute_worker

`with_scheduler=True` is required so RQ's delayed-retry intervals (the 5s/15s/45s
backoff ladder) actually fire.
"""

from __future__ import annotations

import logging
import signal
from types import FrameType

from rq import Connection, Worker

# Registers every @background.handler in THIS process. The list lives in the
# registry module, shared with the web process, because this entrypoint used to
# keep its own copy and silently fell behind it (see registry's docstring).
from app.services import cv_workflow
from app.services.background import registry
from app.services.background.dispatch import LANE_BULK, LANE_FAST
from app.services.job_refresh._redis_state import get_redis_connection, queue_name
from app.security import install_sensitive_log_filter

# `uvicorn.error` because Railway only surfaces that logger's records — an INFO
# on the root logger vanishes, which is how a boot receipt can look like silence.
_log = logging.getLogger("uvicorn.error")


def _install_drain_hook() -> None:
    """On SIGTERM, hand back the jobs this process is about to drop.

    A deploy replaces every worker replica. RQ's own handler starts a warm
    shutdown — finish the current job, then exit — but the platform only waits so
    long before SIGKILL, and a CV analysis runs ~45 seconds. When the kill lands
    first, the job's row keeps a lease nobody is renewing, and the user waits out
    a timeout sized for a hung worker rather than a replaced one. That is exactly
    what stranded a real signup on 2026-08-03.

    So: release those leases immediately, then let RQ's handler run unchanged.
    The next status poll sees an expired lease and re-queues the job, so the work
    resumes on a new replica instead of expiring. This is the fast path; the
    lease deadline remains the backstop for what a dying process cannot do
    (SIGKILL with no warning, power loss).

    Chains to whatever handler RQ already installed rather than replacing it —
    dropping RQ's warm shutdown would trade a stalled job for a killed one.
    """
    previous = signal.getsignal(signal.SIGTERM)

    def _drain(signum: int, frame: FrameType | None) -> None:
        try:
            released = cv_workflow.release_inflight_leases()
            _log.warning("worker draining on SIGTERM — released %d job lease(s)", released)
        except Exception:  # pragma: no cover — a drain hook must never block exit
            _log.exception("worker drain hook failed")
        if callable(previous):
            previous(signum, frame)

    signal.signal(signal.SIGTERM, _drain)


def run() -> None:
    install_sensitive_log_filter()
    # Boot receipt: the Runner states what it can actually run. A job type
    # missing from this line is a job the queue will hand over and this process
    # will reject — cheaper to read here than to infer from a stalled user.
    _log.info(
        "worker boot handlers=%s", ",".join(sorted(registry.registered_job_types()))
    )
    connection = get_redis_connection()
    # Priority order: fast lane (a user is waiting) → bulk → legacy refresh queue
    # (until Job Refresh is ported onto the generalized seam).
    queues = [LANE_FAST, LANE_BULK, queue_name()]
    with Connection(connection):
        worker = Worker(queues)
        # Install RQ's handlers first, then chain ours in front of them.
        worker._install_signal_handlers()
        _install_drain_hook()
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    run()
