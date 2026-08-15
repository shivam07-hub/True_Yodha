from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status

from app.database import get_supabase_admin
from app.repositories import cv_upload_jobs as upload_jobs_repo
from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
)
from app.services import background, cv_parser
from app.services.matching import match_run
from app.services.background import TransientJobError
from app.services.llm_provider import get_cv_skill_provider
from app.services.xp_policy import CV_UPLOAD_XP_COST, CV_UPLOAD_XP_FLOOR
from app.services.xp_service import InsufficientXPError, charge_or_raise, get_xp_balance, refund

_log = logging.getLogger(__name__)


async def _trigger_initial_match_compute(
    user_id: str,
    *,
    force_context_refresh: bool = False,
) -> None:
    """Fire-and-forget: compute first 5 matches after CV upload (free welcome bonus).

    Backlog #36 (de-weekly): no separate "matched this week?" pre-check — that
    used to be a `batch_week`-scoped short-circuit which would wrongly re-fire a
    full compute on a week rollover. `compute_job_matches`'s own cache-hit gate
    (has this user ever matched + anything new since?) is the single source of
    truth for "is there anything to do here" and already handles this."""
    try:
        from app.repositories.jobs import JobsRepository
        from app.routers.jobs._shared import last_monday

        admin_db = get_supabase_admin()
        jobs_repo = JobsRepository(admin_db, admin_db)
        if force_context_refresh:
            jobs_repo.clear_recommendations(user_id)

        # The whole run through the ONE Match Run module — the initial match now also
        # regenerates the Agent Picks band (it never did before). notify=False: the
        # user is in onboarding watching the score reveal, so the bell is redundant.
        # Provider (strong-only judgment lane) is owned by compute_job_matches.
        await match_run.run_match(
            jobs_repo,
            user_id,
            last_monday(),
            force=force_context_refresh,
            excluded_job_ids=[],
            notify=False,
        )
    except Exception as exc:
        # Not swallowed silently: the matches read seam infers `failed` from the
        # empty feed and offers a free re-vet; this metric line is the alerting
        # hook (spike = matcher/provider degradation). See compute_match_health.
        _log.warning(
            "metric match.initial_compute_failed user=%s error=%s", user_id, exc
        )


def _persist_baseline_cv(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    raw_text: str,
    content_hash: str,
    cv_structured: dict | None,
    skills_detected: list[dict[str, Any]] | None = None,
    source: str = "pdf_upload",
) -> int | None:
    """Write a new baseline_upload row into cv_versions."""
    spec = CVVersionWriteSpec(
        kind="baseline_upload",
        job_id=None,
        parent_version_id=None,
        body_text=raw_text,
        cv_structured=cv_structured or {},
        skills_detected=skills_detected or [],
        title="Uploaded baseline CV",
        snapshot_hash=content_hash,
    )
    new_row = cv_repo.create(user_id, spec)

    # ADR-0006 L7 — tag the entry-path cohort. Done via direct admin update
    # because CVVersionWriteSpec is a stable contract; new column threads
    # through without spec churn.
    version_id = (new_row or {}).get("id") if isinstance(new_row, dict) else None
    if version_id:
        try:
            get_supabase_admin().table("cv_versions").update(
                {"source": source}
            ).eq("id", version_id).execute()
        except Exception as exc:  # pragma: no cover — cohort tag is best-effort
            _log.warning("cv_versions.source tag failed for version=%s: %s", version_id, exc)
    return int(version_id) if version_id is not None else None


# ── ADR-0004 two-phase upload ─────────────────────────────────────────────────
# Phase 1 — synchronous, fast (~500ms): validate, extract raw text, hash-check
#   cache, charge XP, persist a processing row, return job_id.
# Phase 2 — async: deterministic recall + skills-only LLM, structured document
#   extraction, persist one reviewable baseline, then mark the intake done.
#   Refund XP on provider failure or empty extraction. Skill confirmation owns
#   scoring and matching after the user reviews the evidence.

_MIN_CV_TEXT_LEN = 80  # below this the LLM has nothing useful to extract
_STALE_PROCESSING_MINUTES = 5
# How many times a stalled upload may be put back on the lane before we stop and
# refund. Deploy casualties recover on the first attempt; anything that stalls
# three times is killing workers, not being killed by them.
_MAX_STALL_REQUEUES = 2

# ADR-0006 §11 — abuse cap on a single user spamming uploads. 5/hour matches
# the worst-case legitimate iteration cycle (CV → review → re-upload) while
# making it impossible to drain LLM budget through one compromised account.
_CV_UPLOAD_MAX_PER_HOUR = 5


def _enforce_user_upload_rate_limit(user_id: str) -> None:
    """Raise 429 if the user has already burned the hourly upload cap.

    Counted against `cv_upload_jobs.created_at` regardless of outcome — a
    failed job still consumed an attempt slot. Refunds are about XP, not
    rate-limit credit; otherwise repeat failures would burn unlimited
    LLM tokens at the provider chain.
    """
    cutoff_iso = _utc_minutes_ago_iso(60)
    try:
        admin = get_supabase_admin()
        result = (
            admin.table("cv_upload_jobs")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", cutoff_iso)
            .execute()
        )
    except Exception as exc:  # pragma: no cover — fail-open
        _log.warning("Upload rate-limit read failed for %s: %s", user_id, exc)
        return
    count = result.count if result.count is not None else len(result.data or [])
    if count >= _CV_UPLOAD_MAX_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "upload_rate_limited",
                "message": (
                    f"You've started {count} uploads in the last hour. "
                    "Take a moment to review the latest result before trying again."
                ),
            },
            headers={
                "X-Myro-Error-Code": "upload_rate_limited",
                "Retry-After": "1800",
            },
        )


def _utc_minutes_ago_iso(minutes: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_utc_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _is_stale_processing_job(row: dict[str, Any]) -> bool:
    if row.get("status") != "processing":
        return False
    lease_expires_at = _parse_utc_datetime(row.get("lease_expires_at"))
    if lease_expires_at is not None:
        return _now_utc() >= lease_expires_at
    created_at = _parse_utc_datetime(row.get("created_at"))
    if created_at is None:
        return False
    return (_now_utc() - created_at) >= timedelta(minutes=_STALE_PROCESSING_MINUTES)


def _sweep_stale_processing_job_if_needed(
    job_id: str,
    user_id: str,
    row: dict[str, Any],
) -> dict[str, Any]:
    """Recover a job whose worker went silent — by re-running it where possible.

    A stranded upload is almost never a broken CV. It is a worker that was killed
    mid-job, overwhelmingly by a deploy: the text was already extracted and is
    still sitting in the RQ payload, so re-running costs nothing the user can see
    and ends with the analysis they asked for. Failing and refunding is the right
    answer only once re-running has stopped being possible.

    Ordering matters. Requeue is attempted FIRST and the row is left `processing`
    on success, so the loading screen keeps its meaning instead of flashing a
    failure the system is about to recover from on its own.
    """
    if not _is_stale_processing_job(row):
        return row

    if _requeue_stalled_job_if_possible(job_id, user_id, row):
        refreshed = upload_jobs_repo.fetch_status_for_owner(job_id, user_id)
        return refreshed or row

    try:
        swept = upload_jobs_repo.sweep_stale_processing_jobs(minutes=_STALE_PROCESSING_MINUTES)
        if swept:
            _log.warning("Status sweep recovered %d stale cv_upload_jobs", len(swept))
    except Exception as exc:  # pragma: no cover — status must remain readable
        _log.exception("Status sweep failed for cv_upload_job=%s: %s", job_id, exc)
        return row
    refreshed = upload_jobs_repo.fetch_status_for_owner(job_id, user_id)
    return refreshed or row


def _requeue_stalled_job_if_possible(
    job_id: str,
    user_id: str,
    row: dict[str, Any],
) -> bool:
    """Put a stalled upload back on the fast lane. True when it is running again.

    Bounded by `_MAX_STALL_REQUEUES`: a job that keeps stalling is not a deploy
    casualty, it is a job that kills workers, and re-running it forever would
    turn one bad CV into an infinite loop across every replica. After the budget
    is spent the caller falls through to fail-and-refund.
    """
    if not background.can_requeue():
        # No durable queue means no stored payload to re-run. Checked before the
        # claim below so an environment that can never recover this way does not
        # write a lease it will immediately have to release.
        return False
    if (row.get("stall_requeue_count") or 0) >= _MAX_STALL_REQUEUES:
        _log.warning(
            "metric cv_upload.requeue_budget_spent job=%s user=%s attempts=%s",
            job_id, user_id, row.get("stall_requeue_count"),
        )
        return False
    # Claim first: this both re-stamps the lease (so a second poller in the same
    # second cannot requeue the same job twice) and confirms the row is still
    # ours to act on.
    if not upload_jobs_repo.claim_for_completion(job_id):
        return False
    if not background.requeue_abandoned(background.LANE_FAST, "cv_upload_analysis", job_id):
        # Nothing to re-run — release the claim we just took so the fail-sweep,
        # which keys on an expired lease, is not blocked by our own heartbeat.
        upload_jobs_repo.expire_lease(job_id)
        return False
    upload_jobs_repo.record_stall_requeue(job_id)
    _log.warning(
        "metric cv_upload.stall_requeued job=%s user=%s phase=%s attempt=%s",
        job_id, user_id, row.get("current_phase"),
        (row.get("stall_requeue_count") or 0) + 1,
    )
    return True


def _status_phase(row: dict[str, Any]) -> str | None:
    if row.get("status") == "done":
        return "ready"
    if row.get("status") == "failed":
        return "failed"
    return row.get("current_phase")


def _assert_cv_text_extractable(raw_text: str, *, source: str) -> None:
    """Reject scanned / image-only PDFs and DOCX-with-only-images BEFORE charging XP.

    The async worker would otherwise refund every time and trap the user in a
    retry loop. Threshold is shared with the typed-text path so both flows
    apply the same minimum-content rule.
    """
    if len(raw_text.strip()) < _MIN_CV_TEXT_LEN:
        if source == "upload":
            detail = (
                "We couldn't read any text in this file. If it's a scanned or "
                "photo-based PDF, export a text-based PDF (Save As → PDF in "
                "Word/Google Docs) and try again."
            )
        else:
            detail = "Please write at least a few sentences about yourself."
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "unreadable_text" if source == "upload" else "text_too_short",
                "message": detail,
            },
            headers={"X-Myro-Error-Code": "unreadable_text" if source == "upload" else "text_too_short"},
        )


def _is_reviewable_baseline(row: dict[str, Any] | None) -> bool:
    """Hash reuse is terminal only when its destination can render immediately."""
    if not row:
        return False
    structured = row.get("cv_structured")
    return isinstance(structured, dict) and bool(structured)


async def start_cv_upload_job(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    file_bytes: bytes,
    file_type: str,
    idempotency_key: str | None = None,
    source: str = "pdf_upload",
) -> dict[str, Any]:
    """Phase 1. Returns one of:
      - {status: "done", skills_detected, score, redirect_to}      ← hash cache hit
      - {status: "processing", job_id}                              ← LLM job queued
      - existing job's status payload                               ← idempotency hit
    Raises 400 on insufficient XP, 422 on unreadable text, 429 on rate-limit.
    """
    if idempotency_key:
        existing = upload_jobs_repo.find_by_idempotency_key(user_id, idempotency_key)
        if existing:
            return _idem_response(existing)

    _enforce_user_upload_rate_limit(user_id)

    raw_text = cv_parser.extract_raw_text(file_bytes, file_type)
    _assert_cv_text_extractable(raw_text, source="upload")
    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()

    cached = cv_repo.find_by_content_hash(user_id, content_hash)
    if _is_reviewable_baseline(cached):
        _log.info("CV hash match for user=%s — free synchronous return", user_id)
        confirmed = bool(cached.get("skills_confirmed_at"))
        return {
            "status": "done",
            "skills_detected": len(cached.get("skills_detected") or []) or cv_repo.count_user_skills(user_id),
            "score": float(cv_repo.get_current_score(user_id) or 0) if confirmed else None,
            "redirect_to": "/onboarding/result",
            "xp_charged": 0,
        }

    return await _start_async_upload_job(
        user_id, raw_text=raw_text, content_hash=content_hash, action="cv_upload",
        idempotency_key=idempotency_key, source=source,
        xp_cost=0 if cached else CV_UPLOAD_XP_COST,
    )


CV_UPLOAD_BUCKET = "cv-uploads"


def _download_cv_object(storage_path: str) -> tuple[bytes, str]:
    """Pull a resumable-uploaded CV out of private storage (service-role, RLS-bypassing).
    Caller MUST have already verified storage_path belongs to the requesting user."""
    ext = storage_path.rsplit(".", 1)[-1].lower() if "." in storage_path else ""
    if ext == "pdf":
        file_type = "pdf"
    elif ext == "docx":
        file_type = "docx"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "unsupported_format", "message": "Only PDF and DOCX files are accepted."},
            headers={"X-Myro-Error-Code": "unsupported_format"},
        )
    try:
        data = get_supabase_admin().storage.from_(CV_UPLOAD_BUCKET).download(storage_path)
    except Exception:  # object gone / storage unreachable — the bytes never landed
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "upload_expired", "message": "Upload expired. Please pick your CV again."},
            headers={"X-Myro-Error-Code": "upload_expired"},
        )
    return data, file_type


def _delete_cv_object(storage_path: str) -> None:
    """Best-effort cleanup once the bytes are in the parse pipeline. Never blocks the response."""
    try:
        get_supabase_admin().storage.from_(CV_UPLOAD_BUCKET).remove([storage_path])
    except Exception:
        _log.warning("metric cv_upload.object_cleanup_failed path=%s", storage_path)


async def start_cv_upload_job_from_storage(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    storage_path: str,
    idempotency_key: str | None = None,
    source: str = "pdf_upload",
) -> dict[str, Any]:
    """Phase 1 for the resumable direct-to-storage path. The browser uploaded the CV
    straight to the cv-uploads bucket (Supabase native resumable/TUS); here we fetch
    those bytes and run the identical parse/charge/score pipeline as the multipart route.
    Mirrors start_cv_upload_job — same CVUP1 idempotency + CVUP4 guard + XP-DB4 charge."""
    # Replay short-circuit BEFORE the download: a retried finalize must not require the
    # object (it's deleted on first success). Same guard start_cv_upload_job runs first.
    if idempotency_key:
        existing = upload_jobs_repo.find_by_idempotency_key(user_id, idempotency_key)
        if existing:
            return _idem_response(existing)

    file_bytes, file_type = _download_cv_object(storage_path)
    try:
        result = await start_cv_upload_job(
            cv_repo, user_id,
            file_bytes=file_bytes, file_type=file_type,
            idempotency_key=idempotency_key, source=source,
        )
    except HTTPException as exc:
        # Permanent rejections (bad/unreadable file) won't pass on retry → drop the object.
        # Transient ones (429/5xx) keep it so a retry can finalize without re-uploading.
        if exc.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_ENTITY):
            _delete_cv_object(storage_path)
        raise
    _delete_cv_object(storage_path)
    return result


def _idem_response(existing: dict[str, Any]) -> dict[str, Any]:
    """Translate a cached job row back into the upload-response shape so the
    frontend's state machine doesn't have to special-case retries."""
    status = existing["status"]
    if status == "done":
        # No score: a replayed job row never held one, and the redirect below is
        # exactly where the user confirms skills and earns it.
        return {
            "status": "done",
            "skills_detected": existing.get("skills_detected") or 0,
            "redirect_to": "/onboarding/result",
            "xp_charged": existing.get("xp_charged", 0),
        }
    if status == "failed":
        return {
            "status": "failed",
            "current_phase": "failed",
            "error_code": existing.get("error_code"),
            "error_detail": existing.get("error_detail") or "CV analysis failed. Please try again.",
            "xp_charged": existing.get("xp_charged", 0),
            "xp_refunded": bool(existing.get("xp_refunded")),
            "new_coin_balance": None,
            "redirect_to": None,
        }
    # processing — return job_id so client resumes polling the live job
    return {"status": "processing", "job_id": str(existing["id"])}


async def start_cv_upload_job_from_text(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    raw_text: str,
    idempotency_key: str | None = None,
    source: str = "text_describe",
) -> dict[str, Any]:
    """Phase 1 for the typed-text variant. Mirrors start_cv_upload_job."""
    if idempotency_key:
        existing = upload_jobs_repo.find_by_idempotency_key(user_id, idempotency_key)
        if existing:
            return _idem_response(existing)

    _enforce_user_upload_rate_limit(user_id)
    _assert_cv_text_extractable(raw_text, source="text")

    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()
    cached = cv_repo.find_by_content_hash(user_id, content_hash)
    if _is_reviewable_baseline(cached):
        _log.info("CV text hash match for user=%s — free synchronous return", user_id)
        confirmed = bool(cached.get("skills_confirmed_at"))
        return {
            "status": "done",
            "skills_detected": len(cached.get("skills_detected") or []) or cv_repo.count_user_skills(user_id),
            "score": float(cv_repo.get_current_score(user_id) or 0) if confirmed else None,
            "redirect_to": "/onboarding/result",
            "xp_charged": 0,
        }

    return await _start_async_upload_job(
        user_id, raw_text=raw_text, content_hash=content_hash, action="cv_upload_text",
        idempotency_key=idempotency_key, source=source,
        xp_cost=0 if cached else CV_UPLOAD_XP_COST,
    )


async def _start_async_upload_job(
    user_id: str,
    *,
    raw_text: str,
    content_hash: str,
    action: str,
    idempotency_key: str | None = None,
    source: str = "pdf_upload",
    xp_cost: int = CV_UPLOAD_XP_COST,
) -> dict[str, Any]:
    """Shared job-creation path for both upload + typed-text flows.

    Order is deliberate:
      1. Insert job row with xp_charged=0 — this is the audit anchor.
      2. Charge XP, tying the ledger entry to the job_id (atomic RPC).
      3. If charge fails (insufficient XP): mark job failed + raise 400.
      4. Update job.xp_charged = amount.
      5. Spawn background runner with the job_id.
    Charge-before-job would lose the audit trail on funded-but-crashed inserts;
    job-before-charge guarantees every charge is reconcilable from cv_upload_jobs.
    """
    job_id = upload_jobs_repo.create_processing_job(
        user_id=user_id,
        content_hash=content_hash,
        idempotency_key=idempotency_key,
    )

    if xp_cost > 0:
        try:
            await charge_or_raise(
                user_id, xp_cost, action,
                floor=CV_UPLOAD_XP_FLOOR,
                ref_table="cv_upload_jobs",
                ref_id=job_id,
            )
        except InsufficientXPError as exc:
            upload_jobs_repo.mark_failed(
                job_id,
                error_code="insufficient_xp",
                error_detail="Not enough tokens to start this upload.",
                refunded=False,
            )
            # Re-raise with the CV-specific recovery CTA appended. Other call
            # sites attach their own CTA (e.g. follow-company → "unfollow another
            # company first") — that's why xp_service stays CTA-free.
            raise HTTPException(
                status_code=exc.status_code,
                detail={
                    "code": "insufficient_xp",
                    "message": (
                        f"{exc.detail} Earn 30 tokens in 5 minutes via a diary entry, or "
                        "complete a practice session for +50 tokens."
                    ),
                },
                headers={"X-Myro-Error-Code": "insufficient_xp"},
            ) from exc

    upload_jobs_repo.mark_charged(job_id, xp_cost)
    upload_jobs_repo.record_notification_started(job_id, user_id)

    # ADR-0008 — fast Work Lane. Durable via RQ when REDIS_URL is set; in-process
    # asyncio fallback (today's behaviour) otherwise. correlation_id = job_id
    # makes the enqueue idempotent under retry.
    background.enqueue(
        background.LANE_FAST,
        "cv_upload_analysis",
        payload={
            "job_id": job_id,
            "user_id": user_id,
            "raw_text": raw_text,
            "content_hash": content_hash,
            "source": source,
        },
        correlation_id=job_id,
    )

    return {"status": "processing", "job_id": job_id}


@background.handler("cv_parse_score")  # deploy-safe adapter for already queued jobs
@background.handler("cv_intake")  # deploy-safe adapter for the first canonical rollout
@background.handler("cv_upload_analysis")
async def _cv_upload_analysis_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    await _run_cv_upload_job(
        job_id=payload["job_id"],
        user_id=payload["user_id"],
        raw_text=payload["raw_text"],
        content_hash=payload["content_hash"],
        source=payload.get("source", "pdf_upload"),
        allow_retry=allow_retry,
    )


@background.failure_handler("cv_parse_score")  # deploy-safe adapter for queued jobs
@background.failure_handler("cv_intake")  # deploy-safe adapter for the first canonical rollout
@background.failure_handler("cv_upload_analysis")
async def _cv_upload_analysis_failure(payload: dict[str, Any]) -> None:
    """RQ retries exhausted for CV intake — refund + mark failed NOW (ADR-0008
    Upload Guarantee) instead of waiting for the orphan-sweep. Idempotent.

    RQ routes two different things here. A job that genuinely exhausted its retry
    ladder really did hit a struggling provider. A job RQ declared *abandoned* —
    `AbandonedJobError`, raised when a worker vanished mid-job — did not: on
    2026-08-03 a deploy killed a worker and the user was told "our CV analysis
    service was busy", which was false and pointed them at the wrong remedy. Name
    the cause we actually know.
    """
    abandoned = bool(payload.get("_abandoned"))
    await _fail_and_refund(
        payload["job_id"],
        payload["user_id"],
        error_code="worker_replaced" if abandoned else "provider_unavailable",
        detail=(
            "This analysis was interrupted while our servers restarted. Your tokens "
            "have been refunded — uploading again will pick up where it left off."
            if abandoned
            else "Our CV analysis service was busy and couldn’t finish. Your tokens "
            "have been refunded — please try again."
        ),
    )


@background.handler("initial_match")
async def _initial_match_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    await _trigger_initial_match_compute(
        payload["user_id"],
        force_context_refresh=bool(payload.get("force_context_refresh")),
    )


@background.handler("cv_structured_enrich")
async def _cv_structured_enrich_handler(
    payload: dict[str, Any], allow_retry: bool
) -> None:
    """Enrich CV layout after the latency-sensitive skill path is complete."""
    structured = await cv_parser.reparse_structured_only(payload["raw_text"])
    if structured is None:
        if allow_retry:
            raise TransientJobError("structured_cv_provider_unavailable")
        _log.warning(
            "Structured CV enrichment unavailable for baseline=%s",
            payload["baseline_version_id"],
        )
        return
    CVVersionsRepository(get_supabase_admin()).update_structured(
        int(payload["baseline_version_id"]), structured
    )


async def _handle_job_failure(
    job_id: str,
    user_id: str,
    *,
    error_code: str,
    detail: str,
    transient: bool,
    allow_retry: bool,
) -> None:
    """Route a CV-parse failure per ADR-0008 retry policy.

    TRANSIENT (provider down / network / internal) + a retry budget available
    (RQ path) → raise TransientJobError so RQ retries with backoff; the job row
    stays `processing` and XP is NOT refunded yet. After RQ exhausts retries the
    orphan-sweep watchman refunds the stranded row. Everywhere else (permanent
    failure, or the in-process path with no retry) → refund + mark failed now.
    """
    if transient and allow_retry:
        raise TransientJobError(error_code)
    await _fail_and_refund(job_id, user_id, error_code=error_code, detail=detail)


async def _run_cv_upload_job(
    *,
    job_id: str,
    user_id: str,
    raw_text: str,
    content_hash: str,
    source: str = "pdf_upload",
    allow_retry: bool = False,
) -> None:
    """Phase 2 Background Job — CV parse + score. Owns its own admin-scoped repo.

    Idempotent on job_id: re-delivery (RQ at-least-once) after a baseline was
    already written is a no-op terminal. `allow_retry` (set on the durable RQ
    path) enables transient-failure retries; permanent failures always fail fast.
    """
    admin_db = get_supabase_admin()
    cv_repo = CVVersionsRepository(admin_db)

    # Idempotency guard — a retried/duplicate delivery for an already-terminal
    # job must not re-parse or double-write a baseline. Fail-open: this is an
    # optimization, not the correctness boundary (charge idempotency is the
    # ledger's job per ADR-0004). If the status read errors, run the job.
    try:
        existing = upload_jobs_repo.fetch_status_for_owner(job_id, user_id)
    except Exception as exc:  # pragma: no cover — read is best-effort
        _log.warning("CV job %s status pre-check failed (%s) — proceeding", job_id, exc)
        existing = None
    if existing and existing.get("status") in ("done", "failed"):
        _log.info("CV job %s already terminal (%s) — skipping re-run", job_id, existing.get("status"))
        return

    _INFLIGHT_UPLOAD_JOBS.add(job_id)
    try:
        await _run_cv_upload_stages(
            job_id=job_id, user_id=user_id, raw_text=raw_text,
            content_hash=content_hash, source=source, allow_retry=allow_retry,
            cv_repo=cv_repo,
        )
    finally:
        _INFLIGHT_UPLOAD_JOBS.discard(job_id)


# Jobs this process is actively running. A worker being shut down uses this to
# say so (see `release_inflight_leases`) rather than leaving the rows to time out.
_INFLIGHT_UPLOAD_JOBS: set[str] = set()


def release_inflight_leases() -> int:
    """Mark every job this process is running as abandoned, right now.

    Called from the Job Runner's shutdown path. A deploy replaces the worker
    while jobs are mid-flight; without this, those rows keep a valid lease that
    nobody is renewing and the user waits it out for no reason. The worker is the
    one participant that knows, at the moment it happens, exactly which jobs it
    is dropping — so it should be the one to say it.

    Best-effort by construction: the lease expiry remains the backstop for the
    case this cannot cover (SIGKILL, power loss). Returns the number released,
    for the shutdown log.
    """
    released = 0
    for job_id in list(_INFLIGHT_UPLOAD_JOBS):
        upload_jobs_repo.expire_lease(job_id)
        released += 1
    if released:
        _log.warning("metric cv_upload.leases_released_on_shutdown count=%d", released)
    return released


async def _run_cv_upload_stages(
    *,
    job_id: str,
    user_id: str,
    raw_text: str,
    content_hash: str,
    source: str,
    allow_retry: bool,
    cv_repo: CVVersionsRepository,
) -> None:
    """The stages themselves. Split out so `_run_cv_upload_job` owns only the
    idempotency guard and in-flight bookkeeping."""

    # Persist each real worker stage. Raw text was read synchronously before this
    # job was accepted, so the async story starts with skill extraction.
    upload_jobs_repo.set_phase(job_id, "finding_skills")
    try:
        parsed = await cv_parser.parse_cv_skills(
            raw_text,
            provider=get_cv_skill_provider(),
        )
    except Exception:  # network / provider library blew up — transient
        _log.exception("CV parse crashed for job=%s user=%s", job_id, user_id)
        await _handle_job_failure(
            job_id, user_id,
            error_code="internal",
            detail="Unexpected error while analysing your CV. Your tokens have been refunded.",
            transient=True, allow_retry=allow_retry,
        )
        return

    if parsed.get("provider_failed"):
        await _handle_job_failure(
            job_id, user_id,
            error_code="provider_unavailable",
            detail="Our CV analysis service was down. Your tokens have been refunded — please try again in a few minutes.",
            transient=True, allow_retry=allow_retry,
        )
        return

    skills_detected = parsed.get("skills_detected", [])
    if not skills_detected:  # permanent — same CV yields the same nothing
        await _handle_job_failure(
            job_id, user_id,
            error_code="no_skills",
            detail="No skills could be extracted from this CV. Your tokens have been refunded — try a more detailed document.",
            transient=False, allow_retry=allow_retry,
        )
        return

    # The long leg is over. Say so.
    #
    # Everything above this line is ONE LLM call, and it is p50 48s / p90 109s of
    # the job. Before this phase existed the whole run wrote exactly two phases —
    # `queued` at row creation and `finding_skills` here — so the screen changed
    # once and then held the same sentence for a minute or more. A wait that never
    # changes reads as a wait that has stopped, which is the complaint this fixes.
    #
    # It is a real boundary, not a decoration: extraction has returned and
    # validated, and what follows is the claim + baseline write. Nothing here is
    # on a timer. If the claim below is lost, `_status_phase` answers from the
    # row's terminal `status`, so a stranded `saving` can never reach a user.
    upload_jobs_repo.set_phase(job_id, "saving")

    # The CV's visual LAYOUT (`cv_structured`) is NOT computed here. It used to be,
    # as a second sequential LLM call after skill extraction.
    #
    # Measured per job in prod on 2026-08-04 (14 jobs carrying `llm_elapsed_ms`,
    # total job time minus the skills call): the layout leg is BIMODAL — ~5-8s for
    # nine of them, and 29s / 37s / 37s / 38s / 52s for the other five. Median ~6s,
    # tail up to ~52s. It is not "half the wait" at the median; it is most of the
    # wait in the tail, and the tail is where users leave. That asymmetry is the
    # 12,000-token output budget its prompt needs to restate every bullet of every
    # role VERBATIM (the skills call asks for 3,072) — dense CVs pay it, short ones
    # do not.
    #
    # Nothing on the screen behind that wait reads it. `FirstRunSkillReview` renders
    # `skills` and `baseline_version_id` only; the score, the direction step and the
    # shortlist are all built on skills. Layout is first needed by the CV playground,
    # which the user reaches after reviewing skills, choosing a direction and picking
    # a role — minutes later — and which already renders `CvDocumentSkeleton` while
    # it waits.
    #
    # So it is always deferred, not only when it fails. `cv_structured = NULL` is a
    # supported state (`get_or_backfill_cv_structured` rebuilds it on first read),
    # and enqueueing unconditionally also removes the failure asymmetry that let a
    # malformed-JSON layout response fail a good analysis.

    # Claim before writing. Everything above was read-only against the job row;
    # this is the first irreversible write, and by now minutes of LLM work have
    # passed during which the job may have been swept as abandoned. Persisting a
    # baseline for a job someone else already failed-and-refunded leaves the user
    # refunded AND holding the analysis.
    if not upload_jobs_repo.claim_for_completion(job_id):
        _log.warning(
            "metric cv_upload.claim_lost job=%s user=%s — job left processing state "
            "during analysis; discarding result",
            job_id, user_id,
        )
        return

    baseline_version_id = _persist_baseline_cv(
        cv_repo, user_id,
        raw_text=raw_text,
        content_hash=content_hash,
        cv_structured=None,
        skills_detected=skills_detected,
        source=source,
    )
    upload_jobs_repo.mark_done(
        job_id,
        skills_detected=len(skills_detected),
        baseline_version_id=baseline_version_id,
        result_payload={
            "extraction": parsed.get("provenance", {}),
            "llm_enrichment_failed": bool(parsed.get("llm_enrichment_failed", False)),
        },
    )

    # FAST, not BULK. The bulk lane is documented "nobody is watching", and while
    # the user is not blocked on the layout, they are walking towards it: the CV
    # playground is where onboarding ends. It has minutes of user-time cover, not
    # unbounded time.
    if baseline_version_id is not None:
        background.enqueue(
            background.LANE_FAST,
            "cv_structured_enrich",
            payload={"raw_text": raw_text, "baseline_version_id": baseline_version_id},
            correlation_id=f"structured:{baseline_version_id}",
        )
        # Score while they review skills (P0.3). Confirm still publishes; excludes
        # force a recompute. Fail-soft — upload success must not depend on this.
        from app.services import onboarding_service

        onboarding_service.enqueue_provisional_baseline_score(user_id, baseline_version_id)


async def _fail_and_refund(
    job_id: str, user_id: str, *, error_code: str, detail: str,
) -> None:
    """Refund the upload charge if one was made, then mark the job failed.

    The refund RPC is idempotent on (ref_table, ref_id) — re-invocation for
    the same job_id returns the current balance without crediting again.
    Worker retries are therefore safe.
    """
    try:
        await refund(
            user_id, CV_UPLOAD_XP_COST, "cv_upload", reason=error_code,
            ref_table="cv_upload_jobs", ref_id=job_id,
        )
        refunded = True
    except Exception as exc:  # pragma: no cover — refund must never crash a job
        _log.exception("Refund failed for job=%s user=%s: %s", job_id, user_id, exc)
        refunded = False
    upload_jobs_repo.mark_failed(
        job_id,
        error_code=error_code,
        error_detail=detail,
        refunded=refunded,
    )


# ── Status read ───────────────────────────────────────────────────────────────

async def get_cv_upload_status(job_id: str, user_id: str) -> dict[str, Any]:
    row = upload_jobs_repo.fetch_status_for_owner(job_id, user_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "job_not_found", "message": "Upload job not found."},
            headers={"X-Myro-Error-Code": "job_not_found"},
        )
    row = _sweep_stale_processing_job_if_needed(job_id, user_id, row)
    # The balance is a TERMINAL fact, so only a terminal read pays for it.
    #
    # This ran on every poll. The client polls every 2s across a p50 48s / p90
    # 109s job, so a single upload spent 24-55 extra `user_profiles` round trips
    # to answer a question nobody asked: the only consumers of this field are the
    # done and failed branches of `resolveCVUploadResult`. Every processing poll
    # fetched it and threw it away — during a signup burst, on the connection
    # capacity that a concurrent-login burst is already competing for.
    #
    # A refund only happens on the failure path, and that path is terminal, so
    # nothing observable is lost by not reading it mid-flight.
    terminal = row["status"] in ("done", "failed")
    balance = await get_xp_balance(user_id) if terminal else None
    return {
        "status": row["status"],
        "current_phase": _status_phase(row),
        "analysis_kind": row.get("analysis_kind") or "baseline",
        "result_payload": row.get("result_payload"),
        "baseline_version_id": row.get("baseline_version_id"),
        "skills_detected": row.get("skills_detected"),
        "error_code": row.get("error_code"),
        "error_detail": row.get("error_detail"),
        "xp_charged": row.get("xp_charged", 0),
        "xp_refunded": bool(row.get("xp_refunded", False)),
        "new_coin_balance": balance,
        # Job-creation timestamp = the moment the user committed to the upload.
        "started_at": row.get("created_at"),
        "redirect_to": "/onboarding/result" if row["status"] == "done" else None,
    }


# ── Lazy structured backfill (kept synchronous — small, single-call) ──────────

async def get_or_backfill_cv_structured(
    cv_repo: CVVersionsRepository, user_id: str
) -> dict | None:
    """Return latest cv_structured for the user, lazily backfilling from body_text.

    Every stored payload is normalized before it is judged, so the shape of a row
    can never fail this read. It used to: the gate here was `if structured:` —
    truthiness, not shape — so a row holding `{"contact": {...}}` and nothing else
    short-circuited the backfill and went straight into a 7-field response model.
    Six users' CV page and download 500'd on every load for a week, with their
    full `body_text` sitting in the same row, parseable, untouched.

    Returns:
        dict — payload matching the full structured contract
        None — no baseline CV, or a baseline with nothing left to rebuild from
               (caller 404s: "upload one")
    Raises HTTP 503 only when a rebuild is genuinely needed and the provider chain
    is down — never for a shape we could have coerced.
    """
    baseline = cv_repo.latest_baseline(user_id)
    if not baseline:
        return None

    stored = cv_parser.normalize_structured(baseline.get("cv_structured"))
    if cv_parser.has_content(stored):
        return stored

    # Nothing renderable in the row. body_text is the source of truth it was built
    # from and is never sanitized, so a rebuild is a repair, not a guess.
    raw_text = baseline.get("body_text") or ""
    if not raw_text:
        _log.warning(
            "metric cv.structured_unrecoverable version_id=%s — no content and no body_text",
            baseline.get("id"),
        )
        return None

    reparsed = await cv_parser.reparse_structured_only(raw_text)
    if reparsed is None or not cv_parser.has_content(reparsed):
        # Deliberately NOT degrading to the contact-only payload. An empty CV in
        # the editor is one autosave away from `body_text` being overwritten with
        # a rendering of that emptiness — destroying the only copy this repair
        # runs on. 503 is retryable; that write is not reversible.
        _log.error(
            "metric cv.structured_rebuild_failed version_id=%s chars=%d",
            baseline.get("id"), len(raw_text),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not parse CV structure right now. Please try again in a minute.",
        )

    _log.info(
        "metric cv.structured_rebuilt version_id=%s chars=%d", baseline.get("id"), len(raw_text)
    )
    cv_repo.update_structured(int(baseline["id"]), reparsed)
    return reparsed
