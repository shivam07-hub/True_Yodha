"""cv_upload_jobs repository — async LLM parse status surface.

Writes always use the admin client (bypass RLS). Reads from the user-facing
GET status route use the token client so RLS enforces ownership.

See ADR-0004 for the contract.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

from app.database import get_supabase_admin

_log = logging.getLogger(__name__)

_TABLE = "cv_upload_jobs"


def create_processing_job(
    *,
    user_id: str,
    content_hash: str | None,
    idempotency_key: str | None = None,
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
    }
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    result = admin.table(_TABLE).insert(payload).execute()
    row = (result.data or [{}])[0]
    job_id = row.get("id")
    if not job_id:
        raise RuntimeError("cv_upload_jobs insert returned no id")
    return str(job_id)


def find_by_idempotency_key(user_id: str, idempotency_key: str) -> dict[str, Any] | None:
    """Lookup an existing job for the (user, key) pair. Returns the full row or None."""
    admin = get_supabase_admin()
    result = (
        admin.table(_TABLE)
        .select("id, status, skills_detected, score, xp_charged, xp_refunded, error_code, error_detail")
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


def mark_done(
    job_id: str,
    *,
    skills_detected: int,
    score: float,
) -> None:
    admin = get_supabase_admin()
    admin.table(_TABLE).update({
        "status": "done",
        "skills_detected": skills_detected,
        "score": score,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


def mark_failed(
    job_id: str,
    *,
    error_code: str,
    error_detail: str,
    refunded: bool,
) -> None:
    admin = get_supabase_admin()
    admin.table(_TABLE).update({
        "status": "failed",
        "error_code": error_code,
        "error_detail": error_detail,
        "xp_refunded": refunded,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job_id).execute()


def fetch_status_for_owner(job_id: str, user_id: str, db: Client | None = None) -> dict[str, Any] | None:
    """Return the job row IF it belongs to `user_id`, else None.

    Uses the admin client by default. Ownership check is explicit so the same
    helper works from both authenticated and background contexts.
    """
    client = db or get_supabase_admin()
    result = (
        client.table(_TABLE)
        .select("id, status, skills_detected, score, error_code, error_detail, xp_charged, xp_refunded, created_at, finished_at")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None
