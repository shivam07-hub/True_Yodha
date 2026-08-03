"""Job Runner entrypoint (ADR-0008).

A worker process, separate from the web process, that drains the Work Lanes
fast-first. Run >=2 replicas for redundancy. Start with:

    python -m app.workers.jobs_compute_worker

`with_scheduler=True` is required so RQ's delayed-retry intervals (the 5s/15s/45s
backoff ladder) actually fire.
"""

from __future__ import annotations

import logging

from rq import Connection, Worker

# Registers every @background.handler in THIS process. The list lives in the
# registry module, shared with the web process, because this entrypoint used to
# keep its own copy and silently fell behind it (see registry's docstring).
from app.services.background import registry
from app.services.background.dispatch import LANE_BULK, LANE_FAST
from app.services.job_refresh._redis_state import get_redis_connection, queue_name
from app.security import install_sensitive_log_filter


def run() -> None:
    install_sensitive_log_filter()
    # Boot receipt: the Runner states what it can actually run. A job type
    # missing from this line is a job the queue will hand over and this process
    # will reject — cheaper to read here than to infer from a stalled user.
    logging.getLogger("uvicorn.error").info(
        "worker boot handlers=%s", ",".join(sorted(registry.registered_job_types()))
    )
    connection = get_redis_connection()
    # Priority order: fast lane (a user is waiting) → bulk → legacy refresh queue
    # (until Job Refresh is ported onto the generalized seam).
    queues = [LANE_FAST, LANE_BULK, queue_name()]
    with Connection(connection):
        worker = Worker(queues)
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    run()
