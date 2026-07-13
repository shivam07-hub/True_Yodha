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
from app.repositories.scores import ScoresRepository
from app.services import background, cv_parser, scoring
from app.services.matching import match_run
from app.services.background import TransientJobError
from app.services.llm_provider import get_cv_upload_provider
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
    source: str = "pdf_upload",
) -> int | None:
    """Write a new baseline_upload row into cv_versions."""
    spec = CVVersionWriteSpec(
        kind="baseline_upload",
        job_id=None,
        parent_version_id=None,
        body_text=raw_text,
        cv_structured=cv_structured or {},
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
# Phase 2 — async (10-60s): LLM parse, score, persist baseline, mark done.
#   Refund XP on provider failure or empty extraction.

_MIN_CV_TEXT_LEN = 80  # below this the LLM has nothing useful to extract
_STALE_PROCESSING_MINUTES = 5

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
    created_at = _parse_utc_datetime(row.get("created_at"))
    if created_at is None:
        return False
    return (_now_utc() - created_at) >= timedelta(minutes=_STALE_PROCESSING_MINUTES)


def _sweep_stale_processing_job_if_needed(
    job_id: str,
    user_id: str,
    row: dict[str, Any],
) -> dict[str, Any]:
    if not _is_stale_processing_job(row):
        return row
    try:
        swept = upload_jobs_repo.sweep_stale_processing_jobs(minutes=_STALE_PROCESSING_MINUTES)
        if swept:
            _log.warning("Status sweep recovered %d stale cv_upload_jobs", len(swept))
    except Exception as exc:  # pragma: no cover — status must remain readable
        _log.exception("Status sweep failed for cv_upload_job=%s: %s", job_id, exc)
        return row
    refreshed = upload_jobs_repo.fetch_status_for_owner(job_id, user_id)
    return refreshed or row


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
    if cached:
        _log.info("CV hash match for user=%s — free synchronous return", user_id)
        return {
            "status": "done",
            "skills_detected": cv_repo.count_user_skills(user_id),
            "score": float(cv_repo.get_current_score(user_id) or 0),
            "redirect_to": "/onboarding/score",
            "xp_charged": 0,
        }

    return await _start_async_upload_job(
        user_id, raw_text=raw_text, content_hash=content_hash, action="cv_upload",
        idempotency_key=idempotency_key, source=source,
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
        return {
            "status": "done",
            "skills_detected": existing.get("skills_detected") or 0,
            "score": float(existing.get("score") or 0),
            "redirect_to": "/onboarding/score",
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
    if cached:
        _log.info("CV text hash match for user=%s — free synchronous return", user_id)
        return {
            "status": "done",
            "skills_detected": cv_repo.count_user_skills(user_id),
            "score": float(cv_repo.get_current_score(user_id) or 0),
            "redirect_to": "/onboarding/score",
            "xp_charged": 0,
        }

    return await _start_async_upload_job(
        user_id, raw_text=raw_text, content_hash=content_hash, action="cv_upload_text",
        idempotency_key=idempotency_key, source=source,
    )


async def _start_async_upload_job(
    user_id: str,
    *,
    raw_text: str,
    content_hash: str,
    action: str,
    idempotency_key: str | None = None,
    source: str = "pdf_upload",
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

    try:
        await charge_or_raise(
            user_id, CV_UPLOAD_XP_COST, action,
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

    upload_jobs_repo.mark_charged(job_id, CV_UPLOAD_XP_COST)

    # ADR-0008 — fast Work Lane. Durable via RQ when REDIS_URL is set; in-process
    # asyncio fallback (today's behaviour) otherwise. correlation_id = job_id
    # makes the enqueue idempotent under retry.
    background.enqueue(
        background.LANE_FAST,
        "cv_parse_score",
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


@background.handler("cv_parse_score")
async def _cv_parse_score_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    await _run_cv_upload_job(
        job_id=payload["job_id"],
        user_id=payload["user_id"],
        raw_text=payload["raw_text"],
        content_hash=payload["content_hash"],
        source=payload.get("source", "pdf_upload"),
        allow_retry=allow_retry,
    )


@background.failure_handler("cv_parse_score")
async def _cv_parse_score_failure(payload: dict[str, Any]) -> None:
    """RQ retries exhausted for a CV parse — refund + mark failed NOW (ADR-0008
    Upload Guarantee) instead of waiting for the orphan-sweep. Idempotent."""
    await _fail_and_refund(
        payload["job_id"],
        payload["user_id"],
        error_code="provider_unavailable",
        detail="Our CV analysis service was busy and couldn’t finish. Your tokens have been refunded — please try again.",
    )


@background.handler("initial_match")
async def _initial_match_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    await _trigger_initial_match_compute(
        payload["user_id"],
        force_context_refresh=bool(payload.get("force_context_refresh")),
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
    scores_repo = ScoresRepository(admin_db)

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

    # #6 deploy-style phases — write before each real stage so the loading UI
    # reflects truth (Reading → Scoring → Ready), not a fabricated clock.
    upload_jobs_repo.set_phase(job_id, "reading")
    try:
        parsed = await cv_parser.parse_cv_text(raw_text, provider=get_cv_upload_provider())
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

    upload_jobs_repo.set_phase(job_id, "scoring")
    try:
        score_row = scoring.record_cv_score(scores_repo, user_id, skills_detected)
    except ValueError:  # permanent — taxonomy mapping won't change on retry
        await _handle_job_failure(
            job_id, user_id,
            error_code="taxonomy_unmapped",
            detail="CV skills could not be mapped to the skill taxonomy. Your tokens have been refunded.",
            transient=False, allow_retry=allow_retry,
        )
        return

    score_total = float(score_row["total_score"])
    baseline_version_id = _persist_baseline_cv(
        cv_repo, user_id,
        raw_text=raw_text,
        content_hash=content_hash,
        cv_structured=parsed.get("cv_structured"),
        source=source,
    )
    upload_jobs_repo.mark_done(
        job_id,
        skills_detected=len(skills_detected),
        score=score_total,
        baseline_version_id=baseline_version_id,
    )
    # ADR-0008 — initial match runs on the bulk Work Lane (nobody's waiting on it).
    background.enqueue(
        background.LANE_BULK,
        "initial_match",
        payload={"user_id": user_id, "force_context_refresh": True},
        correlation_id=user_id,
    )


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
    balance = await get_xp_balance(user_id)
    return {
        "status": row["status"],
        "current_phase": _status_phase(row),
        "analysis_kind": row.get("analysis_kind") or "baseline",
        "result_payload": row.get("result_payload"),
        "baseline_version_id": row.get("baseline_version_id"),
        "skills_detected": row.get("skills_detected"),
        "score": float(row["score"]) if row.get("score") is not None else None,
        "error_code": row.get("error_code"),
        "error_detail": row.get("error_detail"),
        "xp_charged": row.get("xp_charged", 0),
        "xp_refunded": bool(row.get("xp_refunded", False)),
        "new_coin_balance": balance,
        # Job-creation timestamp = the moment the user committed to the upload.
        # Anchors the 10-min CV-promise countdown pill (progressive-nav Q4).
        "started_at": row.get("created_at"),
        "redirect_to": "/onboarding/result" if row["status"] == "done" else None,
    }


# ── Lazy structured backfill (kept synchronous — small, single-call) ──────────

async def get_or_backfill_cv_structured(
    cv_repo: CVVersionsRepository, user_id: str
) -> dict | None:
    """Return latest cv_structured for the user, lazily backfilling from body_text.

    Returns:
        dict — validated structured payload
        None — no baseline CV uploaded yet (caller should 404)
    Raises HTTP 503 only if the LLM provider chain fails AND backfill is needed.
    """
    baseline = cv_repo.latest_baseline(user_id)
    if not baseline:
        return None

    structured = baseline.get("cv_structured")
    if isinstance(structured, dict) and structured:
        return structured

    raw_text = baseline.get("body_text") or ""
    if not raw_text:
        return None

    reparsed = await cv_parser.reparse_structured_only(raw_text)
    if reparsed is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not parse CV structure right now. Please try again in a minute.",
        )
    cv_repo.update_structured(int(baseline["id"]), reparsed)
    return reparsed
