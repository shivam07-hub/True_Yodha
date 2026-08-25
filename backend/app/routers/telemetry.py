from datetime import datetime, timedelta, timezone
import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal

router = APIRouter(prefix="/v1/telemetry", tags=["telemetry"])
_log = logging.getLogger(__name__)


class RoutePerfPayload(BaseModel):
    route: str
    ttfa_ms: int
    tti_cc_ms: int | None = None
    cls: float | None = None
    deploy_id: str | None = None
    backend_version: str | None = None
    viewport: str | None = None
    session_id: str | None = None


class CVUploadPhasePayload(BaseModel):
    phase: Literal["pick", "signed-url", "put", "poll", "parse"]
    outcome: Literal["started", "succeeded", "failed", "retrying", "skipped"]
    attempt: int | None = None
    job_id: str | None = None
    idempotency_key: str | None = None
    reason_code: str | None = None
    error_detail: str | None = None
    http_status: int | None = None
    file_name: str | None = None
    file_mime: str | None = None
    file_size_bytes: int | None = None
    route: str | None = None
    network_type: str | None = None


def _persist_route_perf(payload: RoutePerfPayload, user_id: str) -> None:
    get_supabase_admin().table("route_perf_events").insert({
        "user_id": user_id,
        "route": payload.route,
        "ttfa_ms": payload.ttfa_ms,
        "tti_cc_ms": payload.tti_cc_ms,
        "cls": payload.cls,
        "deploy_id": payload.deploy_id,
        "backend_version": payload.backend_version,
        "viewport": payload.viewport,
        "session_id": payload.session_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


@router.post("/route-perf", status_code=202)
def record_route_perf(
    payload: RoutePerfPayload,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
) -> dict:
    """Accept the measurement and answer; write it after the response.

    A telemetry beacon must not lengthen the journey it measures. Both callers
    fire-and-forget (`fetch(...).catch(() => {})`, `keepalive: true`) and read
    nothing from the body, so 202 is the honest code: accepted, not yet stored.
    """
    background_tasks.add_task(_persist_route_perf, payload, principal.id)
    return {"ok": True}


def _count_cv_upload_events(
    *,
    phase: str,
    since_iso: str,
    outcome: str | None = None,
) -> int:
    admin = get_supabase_admin()
    query = (
        admin.table("cv_upload_phase_events")
        .select("id", count="exact")
        .eq("phase", phase)
        .gte("occurred_at", since_iso)
        .limit(1)
    )
    if outcome:
        query = query.eq("outcome", outcome)
    result = query.execute()
    return int(getattr(result, "count", 0) or 0)


def _maybe_emit_cv_upload_alert(payload: CVUploadPhasePayload) -> bool:
    if payload.outcome != "failed":
        return False
    window_start = datetime.now(timezone.utc) - timedelta(minutes=settings.cv_upload_alert_window_minutes)
    since_iso = window_start.isoformat()
    total = _count_cv_upload_events(phase=payload.phase, since_iso=since_iso)
    if total < settings.cv_upload_alert_min_samples:
        _log.warning(
            "metric cv_upload.phase_failed phase=%s reason=%s attempts=%s threshold_pending=true",
            payload.phase,
            payload.reason_code or "unknown",
            payload.attempt or 0,
        )
        return False
    failed = _count_cv_upload_events(phase=payload.phase, since_iso=since_iso, outcome="failed")
    ratio = failed / total if total else 0.0
    if ratio >= settings.cv_upload_alert_failure_ratio:
        _log.error(
            "metric cv_upload.alert phase=%s failed=%d total=%d ratio=%.4f window_min=%d",
            payload.phase,
            failed,
            total,
            ratio,
            settings.cv_upload_alert_window_minutes,
        )
        return True
    _log.warning(
        "metric cv_upload.phase_failed phase=%s reason=%s attempts=%s ratio=%.4f",
        payload.phase,
        payload.reason_code or "unknown",
        payload.attempt or 0,
        ratio,
    )
    return False


def _persist_cv_upload_phase(payload: CVUploadPhasePayload, user_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    get_supabase_admin().table("cv_upload_phase_events").insert({
        "user_id": user_id,
        "phase": payload.phase,
        "outcome": payload.outcome,
        "attempt": payload.attempt,
        "job_id": payload.job_id,
        "idempotency_key": payload.idempotency_key,
        "reason_code": payload.reason_code,
        "error_detail": payload.error_detail,
        "http_status": payload.http_status,
        "file_name": payload.file_name,
        "file_mime": payload.file_mime,
        "file_size_bytes": payload.file_size_bytes,
        "route": payload.route,
        "network_type": payload.network_type,
        "occurred_at": now,
    }).execute()
    _maybe_emit_cv_upload_alert(payload)


@router.post("/cv-upload-phase", status_code=202)
def record_cv_upload_phase(
    payload: CVUploadPhasePayload,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
) -> dict:
    """Accept the phase event and answer; write and evaluate it afterwards.

    This ran inline and measured 3,806-4,339ms on prod (2026-08-22 and 08-23,
    ARCHITECTURE_READ_PATH.md S16), landing in the same alert window as the
    `POST /cv/upload/finalize` it reports on — 3,554ms and 4,101ms. A failed
    phase cost THREE sequential round trips: the insert, then two `count=exact`
    reads inside `_maybe_emit_cv_upload_alert`. The browser never waited on any
    of it (the caller ignores the response), but the request held a slot in the
    read bulkhead at the exact moment the user's upload needed one.

    The alert still fires; it fires off the response path.
    """
    background_tasks.add_task(_persist_cv_upload_phase, payload, principal.id)
    return {"ok": True}
