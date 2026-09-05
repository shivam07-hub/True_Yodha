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

# How long a worker may go silent before we treat its job as abandoned.
#
# This is a HEARTBEAT, not a deadline: `set_phase` re-stamps it on every phase
# transition, so it only has to outlast the longest SINGLE step, never the whole
# job. It was 20 minutes, sized to "exceed the RQ 15-minute hard timeout" — i.e.
# reasoned about as a one-shot deadline. The cost of that was measured on
# 2026-08-03: a deploy killed a worker 5 seconds into a 45-second job, and the
# user sat on "preparing your cv review" while both recovery clocks (RQ's 15-min
# abandonment TTL and this lease) waited out a worst case that had already
# happened.
#
# Sized instead to the real work: the two LLM steps have run 7.4s / 12.8s / 21.7s
# in production. 180s is ~8× the worst observed single phase, and a genuinely
# slower live job keeps itself alive by advancing a phase.
_LEASE_SECONDS = 180


def _lease_deadline() -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=_LEASE_SECONDS)).isoformat()


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
            "baseline_version_id, skills_detected, xp_charged, "
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
    rows = result.data or []
    if rows:
        from app.notice import Sighting, observe

        observe(Sighting.upload_guarantee(break_kind="job_never_claimed"))
    return rows


def claim_for_completion(job_id: str) -> bool:
    """Re-take ownership of a job right before writing its result.

    Returns False when the row is no longer `processing` — it was swept as
    abandoned, or another delivery finished it. The caller must then discard its
    work instead of persisting.

    Why this exists: the result write is not one statement. `_persist_baseline_cv`
    inserts into `cv_versions` and only afterwards does `mark_done` flip the job.
    `mark_done` is correctly guarded on `status='processing'`, so it refuses to
    resurrect a swept job — but nothing rolls back the baseline it just wrote.
    A worker that is slow rather than dead could therefore leave the user
    refunded, the job marked failed, AND holding a perfectly usable baseline that
    `get_result` would happily serve.

    That was near-impossible under the old 20-minute lease and becomes reachable
    at 180s, so the shrink and this guard belong to the same change.

    Also re-stamps the lease: claiming is a heartbeat, and the write that follows
    is the one step whose interruption is most expensive.
    """
    admin = get_supabase_admin()
    result = (
        admin.table(_TABLE)
        .update({"lease_expires_at": _lease_deadline()})
        .eq("id", job_id)
        .eq("status", "processing")
        .execute()
    )
    return bool(result.data or [])


def expire_lease(job_id: str) -> None:
    """Declare a job abandoned NOW instead of waiting out its lease.

    Used by a worker that knows it is being shut down, and by a failed requeue
    releasing a claim it can no longer honour. Backdated by a second so the
    `< now()` comparison in `sweep_stale_cv_upload_jobs` is unambiguous rather
    than resting on clock equality.
    """
    stamp = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    try:
        get_supabase_admin().table(_TABLE).update({"lease_expires_at": stamp}).eq(
            "id", job_id
        ).eq("status", "processing").execute()
    except Exception as exc:  # pragma: no cover — best-effort, lease expiry backstops
        _log.warning("expire_lease(%s) failed: %s", job_id, exc)


def record_stall_requeue(job_id: str) -> None:
    """Count one recovery attempt, so the budget in cv_workflow can be enforced."""
    admin = get_supabase_admin()
    try:
        admin.rpc("increment_cv_upload_stall_requeue", {"p_job_id": job_id}).execute()
    except Exception as exc:  # pragma: no cover — the counter is a guard, not truth
        _log.warning("record_stall_requeue(%s) failed: %s", job_id, exc)


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
    result_payload: dict[str, Any] | None = None,
    baseline_version_id: int | None = None,
) -> bool:
    admin = get_supabase_admin()
    payload: dict[str, Any] = {
        "status": "done",
        "current_phase": "ready",
        "skills_detected": skills_detected,
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
            job_id, skills_detected=skills_detected
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
            "baseline_version_id, skills_detected, error_code, "
            "error_detail, xp_charged, xp_refunded, created_at, lease_expires_at, "
            "finished_at, stall_requeue_count"
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
