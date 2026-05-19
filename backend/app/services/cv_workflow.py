from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.repositories.cv import (
    CVVersionWriteSpec,
    CVVersionsRepository,
)
from app.repositories.scores import ScoresRepository
from app.services import cv_parser, jobs_workflow, scoring
from app.services.rate_limit import assert_not_rate_limited
from app.services.xp_service import grant_welcome_xp

_log = logging.getLogger(__name__)


async def _trigger_initial_match_compute(user_id: str) -> None:
    """Fire-and-forget: compute first 5 matches after CV upload (no XP cost)."""
    try:
        from app.database import get_supabase_admin
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


async def _grant_welcome_xp_safely(user_id: str) -> None:
    try:
        await grant_welcome_xp(user_id)
    except Exception as exc:
        _log.warning("Welcome XP grant failed for user=%s: %s", user_id, exc)


def _persist_baseline_cv(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    raw_text: str,
    content_hash: str,
    cv_structured: dict | None,
) -> None:
    """Write a new baseline_upload row into cv_versions.

    onboarding_complete is the only profile-side update kept post-unification —
    cv_raw_text / cv_parsed_at columns were dropped in 20260518_cv_versions_unify.
    """
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


async def ingest_uploaded_cv(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    file_bytes: bytes,
    file_type: str,
) -> dict[str, float | int | str]:
    assert_not_rate_limited(
        cv_repo.client, user_id, "cv_versions", "created_at",
        filters={"kind": "baseline_upload"},
    )
    scores_repo = ScoresRepository(cv_repo.client)

    raw_text = cv_parser.extract_raw_text(file_bytes, file_type)
    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()

    cached = cv_repo.find_by_content_hash(user_id, content_hash)
    if cached:
        _log.info("CV hash match for user=%s — returning cached score", user_id)
        await _grant_welcome_xp_safely(user_id)
        return {
            "skills_detected": cv_repo.count_user_skills(user_id),
            "score": float(cv_repo.get_current_score(user_id) or 0),
            "redirect_to": "/onboarding/score",
        }

    parsed = await cv_parser.parse_cv_text(raw_text)
    skills_detected = parsed.get("skills_detected", [])
    if parsed.get("provider_failed"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Our CV analysis service is temporarily unavailable. Please try again in a few minutes.",
        )
    if not skills_detected:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No skills could be extracted from this CV. Try a more detailed document.",
        )

    try:
        score_row = scoring.record_cv_score(scores_repo, user_id, skills_detected)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CV skills could not be mapped to the skill taxonomy. Please revise and try again.",
        ) from exc

    score_total = float(score_row["total_score"])
    _persist_baseline_cv(
        cv_repo,
        user_id,
        raw_text=raw_text,
        content_hash=content_hash,
        cv_structured=parsed.get("cv_structured"),
    )
    await _grant_welcome_xp_safely(user_id)
    asyncio.create_task(_trigger_initial_match_compute(user_id))
    return {
        "skills_detected": len(skills_detected),
        "score": score_total,
        "redirect_to": "/onboarding/score",
    }


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


async def ingest_cv_text(
    cv_repo: CVVersionsRepository,
    user_id: str,
    *,
    raw_text: str,
) -> dict[str, float | int | str]:
    assert_not_rate_limited(
        cv_repo.client, user_id, "cv_versions", "created_at",
        filters={"kind": "baseline_upload"},
    )
    scores_repo = ScoresRepository(cv_repo.client)

    if len(raw_text) < 80:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please write at least a few sentences about yourself.",
        )

    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()
    cached = cv_repo.find_by_content_hash(user_id, content_hash)
    if cached:
        _log.info("CV text hash match for user=%s — returning cached score", user_id)
        await _grant_welcome_xp_safely(user_id)
        return {
            "skills_detected": cv_repo.count_user_skills(user_id),
            "score": float(cv_repo.get_current_score(user_id) or 0),
            "redirect_to": "/onboarding/score",
        }

    parsed = await cv_parser.parse_cv_text(raw_text)
    skills_detected = parsed.get("skills_detected", [])
    if parsed.get("provider_failed"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Our CV analysis service is temporarily unavailable. Please try again in a few minutes.",
        )
    if not skills_detected:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No skills could be identified from your description. Try adding more detail about your work and projects.",
        )

    try:
        score_row = scoring.record_cv_score(scores_repo, user_id, skills_detected)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CV skills could not be mapped to the skill taxonomy. Please revise and try again.",
        ) from exc

    score_total = float(score_row["total_score"])
    _persist_baseline_cv(
        cv_repo,
        user_id,
        raw_text=raw_text,
        content_hash=content_hash,
        cv_structured=parsed.get("cv_structured"),
    )
    await _grant_welcome_xp_safely(user_id)
    asyncio.create_task(_trigger_initial_match_compute(user_id))
    return {
        "skills_detected": len(skills_detected),
        "score": score_total,
        "redirect_to": "/onboarding/score",
    }
