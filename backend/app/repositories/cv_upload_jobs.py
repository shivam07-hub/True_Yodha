"""cv_upload_jobs repository — async LLM parse status surface.

Writes always use the admin client (bypass RLS). Reads from the user-facing
GET status route use the token client so RLS enforces ownership.

See ADR-0004 for the contract.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from supabase import Client

from app.database import get_supabase_admin
from app.repositories.notifications import NotificationsRepository

_log = logging.getLogger(__name__)

_TABLE = "cv_upload_jobs"
_LEASE_MINUTES = 20  # exceeds the RQ 15-minute hard timeout


def _lease_deadline() -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=_LEASE_MINUTES)).isoformat()


def create_processing_job(
    *,
    user_id: str,
    content_hash: str | None,
    idempotency_key: str | None = None,
    analysis_kind: str = "baseline",
) -> str:
    """Insert a row in `processing` status with xp_charged=0. Caller charges
    XP against this job_id immediately after; mark_charged updates the column
    once the RPC returns."""
    admin = get_supabase_admin()
    payload: dict[str, Any] = {
        "user_id": user_id,
        "status": "processing",
        "xp_charged": 0,
        "content_hash": content_hash,
        "current_phase": "queued",
        "lease_expires_at": _lease_deadline(),
        "analysis_kind": analysis_kind,
    }
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    result = admin.table(_TABLE).insert(payload).execute()
    row = (result.data or [{}])[0]
    job_id = row.get("id")
    if not job_id:
        raise RuntimeError("cv_upload_jobs insert returned no id")
    return str(job_id)


def record_notification_started(job_id: str, user_id: str) -> None:
    """Project an accepted, funded baseline analysis into the inbox."""
    try:
        admin = get_supabase_admin()
        NotificationsRepository(admin, admin).record_cv_analysis_started(
            user_id, source_id=job_id
        )
    except Exception as exc:  # notification projection must not block upload
        _log.warning("CV job %s notification start failed: %s", job_id, exc)


def find_by_idempotency_key(user_id: str, idempotency_key: str) -> dict[str, Any] | None:
    """Lookup an existing job for the (user, key) pair. Returns the full row or None."""
    admin = get_supabase_admin()
    result = (
        admin.table(_TABLE)
        .select(
            "id, status, current_phase, analysis_kind, result_payload, "
            "baseline_version_id, skills_detected, score, xp_charged, "
            "xp_refunded, error_code, error_detail"
        )
        .eq("user_id", user_id)
        .eq("idempotency_key", idempotency_key)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def sweep_stale_processing_jobs(minutes: int = 5) -> list[dict[str, Any]]:
    """Mark processing jobs older than `minutes` as failed + refund.
    Returns the list of swept rows. Safe to call repeatedly (refund RPC is
    idempotent on ref_table/ref_id).
    """
    admin = get_supabase_admin()
    result = admin.rpc("sweep_stale_cv_upload_jobs", {"p_minutes": minutes}).execute()
    return result.data or []


def mark_charged(job_id: str, amount: int) -> None:
    admin = get_supabase_admin()
    admin.table(_TABLE).update({"xp_charged": amount}).eq("id", job_id).execute()


def set_phase(job_id: str, phase: str) -> None:
    """Advance the coarse loading phase (#6 deploy-style progress). Best-effort —
    a write failure must never abort the parse/score the user is waiting on."""
    try:
        admin = get_supabase_admin()
        result = (
            admin.table(_TABLE)
            .update({"current_phase": phase, "lease_expires_at": _lease_deadline()})
            .eq("id", job_id)
            .eq("status", "processing")
            .execute()
        )
    except Exception as exc:  # pragma: no cover — telemetry only, never fatal
        _log.warning("set_phase(%s, %s) failed: %s", job_id, phase, exc)
        return
    if not (result.data or []):
        return
    try:
        NotificationsRepository(admin, admin).update_cv_analysis_phase(job_id, phase)
    except Exception as exc:  # notification projection has separate observability
        _log.warning("CV job %s phase notification failed: %s", job_id, exc)


def mark_done(
    job_id: str,
    *,
    skills_detected: int,
    score: float | None,
    result_payload: dict[str, Any] | None = None,
    baseline_version_id: int | None = None,
) -> bool:
    admin = get_supabase_admin()
    payload: dict[str, Any] = {
        "status": "done",
        "current_phase": "ready",
        "skills_detected": skills_detected,
        "score": score,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "lease_expires_at": None,
    }
    if result_payload is not None:
        payload["result_payload"] = result_payload
    if baseline_version_id is not None:
        payload["baseline_version_id"] = baseline_version_id
    result = (
        admin.table(_TABLE)
        .update(payload)
        .eq("id", job_id)
        .eq("status", "processing")
        .execute()
    )
    if not (result.data or []):
        return False
    try:
        NotificationsRepository(admin, admin).record_cv_analysis_done(
            job_id, skills_detected=skills_detected, score=score
        )
    except Exception as exc:  # notification projection must not change job truth
        _log.warning("CV job %s ready notification failed: %s", job_id, exc)
    return True


def mark_failed(
    job_id: str,
    *,
    error_code: str,
    error_detail: str,
    refunded: bool,
) -> bool:
    admin = get_supabase_admin()
    result = admin.table(_TABLE).update({
        "status": "failed",
        "current_phase": "failed",
        "error_code": error_code,
        "error_detail": error_detail,
        "xp_refunded": refunded,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "lease_expires_at": None,
    }).eq("id", job_id).eq("status", "processing").execute()
    if not (result.data or []):
        return False
    try:
        NotificationsRepository(admin, admin).record_cv_analysis_failed(
            job_id, refunded=refunded
        )
    except Exception as exc:  # notification projection must not change job truth
        _log.warning("CV job %s failure notification failed: %s", job_id, exc)
    return True


def fetch_status_for_owner(job_id: str, user_id: str, db: Client | None = None) -> dict[str, Any] | None:
    """Return the job row IF it belongs to `user_id`, else None.

    Uses the admin client by default. Ownership check is explicit so the same
    helper works from both authenticated and background contexts.
    """
    client = db or get_supabase_admin()
    result = (
        client.table(_TABLE)
        .select(
            "id, status, current_phase, analysis_kind, result_payload, "
            "baseline_version_id, skills_detected, score, error_code, "
            "error_detail, xp_charged, xp_refunded, created_at, lease_expires_at, finished_at"
        )
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def get_latest_status(user_id: str) -> dict[str, Any] | None:
    """Latest CV-upload job for a user — `{status, created_at, finished_at}`.

    Used by the matches read seam to tell an in-flight compute ("still parsing /
    matching") apart from a genuine failure (upload terminally done long ago, yet
    no matches landed). Admin client + explicit user filter — a server-side read,
    never user-supplied ids."""
    admin = get_supabase_admin()
    result = (
        admin.table(_TABLE)
        .select("status, created_at, finished_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None
