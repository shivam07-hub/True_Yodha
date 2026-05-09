from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.repositories.scores import ScoresRepository
from app.repositories.cv import CVRepository
from app.services import cv_parser, scoring_engine
from app.services.rate_limit import assert_not_rate_limited
from app.services.xp_service import grant_welcome_xp

_log = logging.getLogger(__name__)


def _persist_baseline_cv(
    cv_repo: CVRepository,
    user_id: str,
    *,
    raw_text: str,
    skills_detected: list[dict],
    score_total: float,
    content_hash: str,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    cv_repo.update_cv_profile(
        user_id,
        {
            "cv_raw_text": raw_text,
            "cv_parsed_at": now,
            "onboarding_complete": True,
        },
    )
    cv_repo.insert_cv_history(
        {
            "user_id": user_id,
            "skills_count": len(skills_detected),
            "mirror_score": score_total,
            "uploaded_at": now,
            "cv_raw_text": raw_text,
            "version_number": cv_repo.next_version_number(user_id),
            "version_type": "baseline_upload",
            "title": "Uploaded baseline CV",
            "evidence_count": 0,
            "content_hash": content_hash,
        }
    )


async def ingest_uploaded_cv(
    cv_repo: CVRepository,
    user_id: str,
    *,
    file_bytes: bytes,
    file_type: str,
) -> dict[str, float | int | str]:
    assert_not_rate_limited(cv_repo.client, user_id, "cv_history", "uploaded_at")
    scores_repo = ScoresRepository(cv_repo.client)

    raw_text = cv_parser.extract_raw_text(file_bytes, file_type)
    content_hash = hashlib.sha256(raw_text.encode()).hexdigest()

    cached = cv_repo.find_by_content_hash(user_id, content_hash)
    if cached:
        _log.info("CV hash match for user=%s — returning cached score", user_id)
        try:
            await grant_welcome_xp(user_id)
        except Exception as exc:
            _log.warning("Welcome XP grant failed for user=%s: %s", user_id, exc)
        return {
            "skills_detected": int(cached["skills_count"]),
            "score": float(cached["mirror_score"]),
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
        score_row = scoring_engine.compute_and_persist_score(
            scores_repo,
            user_id,
            skills_detected,
            include_market_signals=False,
            require_skills_assessed=True,
        )
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
        skills_detected=skills_detected,
        score_total=score_total,
        content_hash=content_hash,
    )
    try:
        await grant_welcome_xp(user_id)
    except Exception as exc:
        _log.warning("Welcome XP grant failed for user=%s: %s", user_id, exc)
    return {
        "skills_detected": len(skills_detected),
        "score": score_total,
        "redirect_to": "/onboarding/score",
    }


async def ingest_cv_text(
    cv_repo: CVRepository,
    user_id: str,
    *,
    raw_text: str,
) -> dict[str, float | int | str]:
    assert_not_rate_limited(cv_repo.client, user_id, "cv_history", "uploaded_at")
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
        return {
            "skills_detected": int(cached["skills_count"]),
            "score": float(cached["mirror_score"]),
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
        score_row = scoring_engine.compute_and_persist_score(
            scores_repo,
            user_id,
            skills_detected,
            include_market_signals=False,
            require_skills_assessed=True,
        )
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
        skills_detected=skills_detected,
        score_total=score_total,
        content_hash=content_hash,
    )
    return {
        "skills_detected": len(skills_detected),
        "score": score_total,
        "redirect_to": "/onboarding/score",
    }
