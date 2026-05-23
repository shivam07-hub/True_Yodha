from __future__ import annotations

import asyncio
import hashlib
import logging
from typing import Any

from fastapi import HTTPException, status

from app.database import get_supabase_admin
from app.repositories import cv_upload_jobs as upload_jobs_repo
from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
)
from app.repositories.scores import ScoresRepository
from app.services import cv_parser, jobs_workflow, scoring
from app.services.llm_provider import get_cv_upload_provider
from app.services.xp_policy import CV_UPLOAD_XP_COST, CV_UPLOAD_XP_FLOOR
from app.services.xp_service import InsufficientXPError, charge_or_raise, get_xp_balance, refund

_log = logging.getLogger(__name__)


async def _trigger_initial_match_compute(user_id: str) -> None:
    """Fire-and-forget: compute first 5 matches after CV upload (free welcome bonus)."""
    try:
        from app.repositories.jobs import JobsRepository
        from app.services.llm_provider import get_llm_provider
        from app.routers.jobs._shared import last_monday

        admin_db = get_supabase_admin()
        jobs_repo = JobsRepository(admin_db, admin_db)
        batch_week = last_monday()

        existing = jobs_repo.get_existing_match_job_ids(user_id, batch_week)
        if existing:
            return

        await jobs_workflow.compute_job_matches(
            repo=jobs_repo,
            user_id=user_id,
            batch_week=batch_week,
            llm_provider=get_llm_provider(),
            excluded_job_ids=[],
        )
    except Exception as exc:
        _log.warning("Initial match compute failed for user=%s: %s", user_id, exc)


def _persist_baseline_cv(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    raw_text: str,
    content_hash: str,
    cv_structured: dict | None,
) -> None:
    """Write a new baseline_upload row into cv_versions."""
    cv_repo.update_cv_profile(user_id, {"onboarding_complete": True})
    spec = CVVersionWriteSpec(
        kind="baseline_upload",
        job_id=None,
        parent_version_id=None,
        body_text=raw_text,
        cv_structured=cv_structured or {},
        title="Uploaded baseline CV",
        snapshot_hash=content_hash,
    )
    cv_repo.create(user_id, spec)


# ── ADR-0004 two-phase upload ─────────────────────────────────────────────────
# Phase 1 — synchronous, fast (~500ms): validate, extract raw text, hash-check
#   cache, charge XP, persist a processing row, return job_id.
# Phase 2 — async (10-60s): LLM parse, score, persist baseline, mark done.
#   Refund XP on provider failure or empty extraction.

_MIN_CV_TEXT_LEN = 80  # below this the LLM has nothing useful to extract


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
            detail=detail,
        )


async def start_cv_upload_job(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    file_bytes: bytes,
    file_type: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Phase 1. Returns one of:
      - {status: "done", skills_detected, score, redirect_to}      ← hash cache hit
      - {status: "processing", job_id}                              ← LLM job queued
      - existing job's status payload                               ← idempotency hit
    Raises 400 on insufficient XP, 422 on unreadable text.
    """
    if idempotency_key:
        existing = upload_jobs_repo.find_by_idempotency_key(user_id, idempotency_key)
        if existing:
            return _idem_response(existing)

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
        idempotency_key=idempotency_key,
    )


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
    # processing or failed — return job_id so client polls / surfaces failure
    return {"status": "processing", "job_id": str(existing["id"])}


async def start_cv_upload_job_from_text(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    raw_text: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Phase 1 for the typed-text variant. Mirrors start_cv_upload_job."""
    if idempotency_key:
        existing = upload_jobs_repo.find_by_idempotency_key(user_id, idempotency_key)
        if existing:
            return _idem_response(existing)

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
        idempotency_key=idempotency_key,
    )


async def _start_async_upload_job(
    user_id: str,
    *,
    raw_text: str,
    content_hash: str,
    action: str,
    idempotency_key: str | None = None,
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
            error_detail="Not enough XP to start this upload.",
            refunded=False,
        )
        # Re-raise with the CV-specific recovery CTA appended. Other call
        # sites attach their own CTA (e.g. follow-company → "unfollow another
        # company first") — that's why xp_service stays CTA-free.
        raise HTTPException(
            status_code=exc.status_code,
            detail=(
                f"{exc.detail} Earn 30 XP in 5min via a diary entry, or "
                "complete a forge session for +50 XP."
            ),
        ) from exc

    upload_jobs_repo.mark_charged(job_id, CV_UPLOAD_XP_COST)

    asyncio.create_task(_run_cv_upload_job(
        job_id=job_id,
        user_id=user_id,
        raw_text=raw_text,
        content_hash=content_hash,
    ))

    return {"status": "processing", "job_id": job_id}


async def _run_cv_upload_job(
    *,
    job_id: str,
    user_id: str,
    raw_text: str,
    content_hash: str,
) -> None:
    """Phase 2 — runs in a background task. Owns its own admin-scoped repo."""
    admin_db = get_supabase_admin()
    cv_repo = CVVersionsRepository(admin_db)
    scores_repo = ScoresRepository(admin_db)

    try:
        parsed = await cv_parser.parse_cv_text(raw_text, provider=get_cv_upload_provider())
    except Exception as exc:  # network / provider library blew up
        _log.exception("CV parse crashed for job=%s user=%s", job_id, user_id)
        await _fail_and_refund(
            job_id, user_id,
            error_code="internal",
            detail="Unexpected error while analysing your CV. Your XP has been refunded.",
        )
        return

    if parsed.get("provider_failed"):
        await _fail_and_refund(
            job_id, user_id,
            error_code="provider_unavailable",
            detail="Our CV analysis service was down. Your XP has been refunded — please try again in a few minutes.",
        )
        return

    skills_detected = parsed.get("skills_detected", [])
    if not skills_detected:
        await _fail_and_refund(
            job_id, user_id,
            error_code="no_skills",
            detail="No skills could be extracted from this CV. Your XP has been refunded — try a more detailed document.",
        )
        return

    try:
        score_row = scoring.record_cv_score(scores_repo, user_id, skills_detected)
    except ValueError:
        await _fail_and_refund(
            job_id, user_id,
            error_code="taxonomy_unmapped",
            detail="CV skills could not be mapped to the skill taxonomy. Your XP has been refunded.",
        )
        return

    score_total = float(score_row["total_score"])
    _persist_baseline_cv(
        cv_repo, user_id,
        raw_text=raw_text,
        content_hash=content_hash,
        cv_structured=parsed.get("cv_structured"),
    )
    upload_jobs_repo.mark_done(job_id, skills_detected=len(skills_detected), score=score_total)
    asyncio.create_task(_trigger_initial_match_compute(user_id))


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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload job not found.")
    balance = await get_xp_balance(user_id)
    return {
        "status": row["status"],
        "skills_detected": row.get("skills_detected"),
        "score": float(row["score"]) if row.get("score") is not None else None,
        "error_code": row.get("error_code"),
        "error_detail": row.get("error_detail"),
        "xp_charged": row.get("xp_charged", 0),
        "xp_refunded": bool(row.get("xp_refunded", False)),
        "new_xp_balance": balance,
        "redirect_to": "/onboarding/score" if row["status"] == "done" else None,
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
