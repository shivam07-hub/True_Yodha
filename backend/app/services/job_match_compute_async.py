from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timezone
from typing import Any

from redis import Redis
from rq import Queue
from rq.job import Job

from app.config import settings
from app.repositories.jobs import get_admin_jobs_repository
from app.services import jobs_workflow
from app.services.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

STATUS_IDLE = "idle"
STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"

TERMINAL_STATUSES = {STATUS_SUCCEEDED, STATUS_FAILED}
ACTIVE_STATUSES = {STATUS_QUEUED, STATUS_RUNNING}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _batch_week_value(batch_week: date | str) -> str:
    if isinstance(batch_week, date):
        return str(batch_week)
    return str(batch_week)


def _ensure_redis_configured() -> str:
    redis_url = settings.redis_url.strip()
    if not redis_url:
        raise RuntimeError("REDIS_URL is required for async jobs compute.")
    return redis_url


def get_redis_connection() -> Redis:
    return Redis.from_url(_ensure_redis_configured(), decode_responses=True)


def get_queue_name() -> str:
    return settings.job_compute_queue_name.strip() or "jobs_compute"


def _status_key(user_id: str, batch_week: date | str) -> str:
    return f"jobs:compute:status:{user_id}:{_batch_week_value(batch_week)}"


def _lock_key(user_id: str, batch_week: date | str) -> str:
    return f"jobs:compute:lock:{user_id}:{_batch_week_value(batch_week)}"


def _job_id(user_id: str, batch_week: date | str) -> str:
    return f"jobs:compute:{user_id}:{_batch_week_value(batch_week)}"


def _base_status(user_id: str, batch_week: date | str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "batch_week": _batch_week_value(batch_week),
        "status": STATUS_IDLE,
        "job_id": None,
        "already_running": False,
        "matches_written": None,
        "from_cache": None,
        "needs_onboarding": None,
        "debug": None,
        "message": None,
        "error": None,
        "enqueued_at": None,
        "started_at": None,
        "finished_at": None,
    }


def get_status(user_id: str, batch_week: date | str) -> dict[str, Any]:
    conn = get_redis_connection()
    raw = conn.get(_status_key(user_id, batch_week))
    if not raw:
        return _base_status(user_id, batch_week)
    try:
        data = json.loads(raw)
    except Exception:
        logger.warning("Invalid JSON in compute status for user=%s week=%s", user_id, _batch_week_value(batch_week))
        return _base_status(user_id, batch_week)
    base = _base_status(user_id, batch_week)
    base.update(data if isinstance(data, dict) else {})
    return base


def set_status(user_id: str, batch_week: date | str, payload: dict[str, Any]) -> dict[str, Any]:
    conn = get_redis_connection()
    status = _base_status(user_id, batch_week)
    status.update(payload)
    conn.set(
        _status_key(user_id, batch_week),
        json.dumps(status),
        ex=max(60, int(settings.job_compute_status_ttl_seconds or 24 * 3600)),
    )
    return status


def enqueue_compute_job(user_id: str, batch_week: date) -> dict[str, Any]:
    batch_week_str = _batch_week_value(batch_week)
    conn = get_redis_connection()
    existing = get_status(user_id, batch_week_str)
    if existing["status"] in ACTIVE_STATUSES:
        existing["already_running"] = True
        existing["message"] = "Job match compute is already running."
        return existing

    lock_key = _lock_key(user_id, batch_week_str)
    lock_ttl = max(60, int(settings.job_compute_lock_ttl_seconds or 30 * 60))
    acquired = conn.set(lock_key, _utc_now_iso(), nx=True, ex=lock_ttl)
    if not acquired:
        running = get_status(user_id, batch_week_str)
        running["already_running"] = True
        if running["status"] == STATUS_IDLE:
            running["status"] = STATUS_RUNNING
        if not running.get("message"):
            running["message"] = "Job match compute is already running."
        return running

    queue = Queue(get_queue_name(), connection=conn)
    job_id = _job_id(user_id, batch_week_str)
    try:
        job: Job = queue.enqueue(
            "app.services.job_match_compute_async.process_compute_job",
            user_id,
            batch_week_str,
            job_id=job_id,
            job_timeout=15 * 60,
            result_ttl=3600,
            failure_ttl=24 * 3600,
        )
    except Exception as exc:
        conn.delete(lock_key)
        raise RuntimeError(f"Failed to enqueue jobs compute: {exc}") from exc

    return set_status(
        user_id,
        batch_week_str,
        {
            "status": STATUS_QUEUED,
            "job_id": job.get_id(),
            "already_running": False,
            "message": "Queued background jobs compute.",
            "enqueued_at": _utc_now_iso(),
            "started_at": None,
            "finished_at": None,
            "error": None,
        },
    )


def process_compute_job(user_id: str, batch_week: str) -> dict[str, Any]:
    lock_key = _lock_key(user_id, batch_week)
    conn = get_redis_connection()
    started_at = _utc_now_iso()
    set_status(
        user_id,
        batch_week,
        {
            "status": STATUS_RUNNING,
            "already_running": False,
            "started_at": started_at,
            "message": "Computing matched jobs.",
            "error": None,
        },
    )

    try:
        repo = get_admin_jobs_repository()
        llm_provider = get_llm_provider()
        payload = asyncio.run(
            jobs_workflow.compute_job_matches(
                repo=repo,
                user_id=user_id,
                batch_week=date.fromisoformat(batch_week),
                llm_provider=llm_provider,
            )
        )
        finished_at = _utc_now_iso()
        status_payload = set_status(
            user_id,
            batch_week,
            {
                "status": STATUS_SUCCEEDED,
                "already_running": False,
                "matches_written": int(payload.get("matches_written", 0)),
                "from_cache": bool(payload.get("from_cache", False)),
                "needs_onboarding": bool(payload.get("needs_onboarding", False)),
                "debug": payload.get("debug"),
                "message": "Matched jobs updated.",
                "finished_at": finished_at,
                "error": None,
            },
        )
        return status_payload
    except Exception as exc:
        finished_at = _utc_now_iso()
        logger.exception("Async jobs compute failed for user=%s week=%s", user_id, batch_week)
        error_payload = set_status(
            user_id,
            batch_week,
            {
                "status": STATUS_FAILED,
                "already_running": False,
                "message": "Matched jobs compute failed.",
                "error": str(exc),
                "finished_at": finished_at,
            },
        )
        return error_payload
    finally:
        conn.delete(lock_key)
