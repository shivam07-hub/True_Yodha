"""Job Runner entrypoint (ADR-0008).

A worker process, separate from the web process, that drains the Work Lanes
fast-first. Run >=2 replicas for redundancy. Start with:

    python -m app.workers.jobs_compute_worker

`with_scheduler=True` is required so RQ's delayed-retry intervals (the 5s/15s/45s
backoff ladder) actually fire.
"""

from __future__ import annotations

from rq import Connection, Worker

# Importing the handler modules registers their @background.handler functions in
# the dispatch registry inside THIS process — without these imports the Runner
# would receive a job_type it has no handler for.
import app.services.career_reservoir  # noqa: F401  (story_ingest)
import app.services.cv_skill_edit  # noqa: F401  (skill_retag)
import app.services.cv_workflow  # noqa: F401  (cv_upload_analysis, initial_match)
import app.services.matching.scrape_sweep  # noqa: F401  (scrape_match_recompute)
from app.services.background.dispatch import LANE_BULK, LANE_FAST
from app.services.job_refresh._redis_state import get_redis_connection, queue_name
from app.security import install_sensitive_log_filter


def run() -> None:
    install_sensitive_log_filter()
    connection = get_redis_connection()
    # Priority order: fast lane (a user is waiting) → bulk → legacy refresh queue
    # (until Job Refresh is ported onto the generalized seam).
    queues = [LANE_FAST, LANE_BULK, queue_name()]
    with Connection(connection):
        worker = Worker(queues)
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    run()
