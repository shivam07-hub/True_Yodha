"""Redis-backed state + RQ queue glue. Imported lazily — local dev skips it."""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from redis import Redis
from rq import Queue

from app.config import settings

_STATE_TTL_SECONDS = 24 * 3600
_QUEUE_NAME = "jobs_compute"
_JOB_TIMEOUT = 15 * 60


def _connection() -> Redis:
    url = settings.redis_url.strip()
    if not url:
        raise RuntimeError("REDIS_URL is required for async job refresh.")
    return Redis.from_url(url, decode_responses=True)


def set_state(key: str, payload: dict[str, Any]) -> None:
    conn = _connection()
    conn.set(key, json.dumps(payload), ex=_STATE_TTL_SECONDS)


def get_state(key: str) -> dict[str, Any] | None:
    conn = _connection()
    raw = conn.get(key)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def enqueue_pipeline(
    *,
    user_id: str,
    ticket_id: str,
    batch_week: date,
    excluded_job_ids: list[str],
    xp_charged: int,
) -> str:
    conn = _connection()
    queue = Queue(_QUEUE_NAME, connection=conn)
    job = queue.enqueue(
        "app.services.job_refresh._dispatch.run_pipeline_worker",
        user_id,
        ticket_id,
        str(batch_week),
        excluded_job_ids,
        int(xp_charged),
        job_id=f"job_refresh:{user_id}:{ticket_id}",
        job_timeout=_JOB_TIMEOUT,
        result_ttl=3600,
        failure_ttl=24 * 3600,
    )
    return job.get_id()


def queue_name() -> str:
    return _QUEUE_NAME


def get_redis_connection() -> Redis:
    return _connection()
