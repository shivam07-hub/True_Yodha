from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.deps import get_current_user
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.schemas import CVUploadResponse
from app.services import cv_parser, scoring_engine
from app.services.rate_limit import assert_not_rate_limited

router = APIRouter()

ALLOWED_TYPES = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


class CVTextRequest(BaseModel):
    text: str


@router.post("/upload", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_cv(
    file: UploadFile,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVUploadResponse:
    assert_not_rate_limited(cv_repo.client, current_user["user_id"], "cv_history", "uploaded_at")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and DOCX files are accepted.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large — maximum size is 10MB.",
        )

    file_type = "pdf" if file.content_type == "application/pdf" else "docx"
    parsed = await cv_parser.parse_cv(file_bytes, file_type)
    skills_detected = parsed.get("skills_detected", [])
    raw_text = parsed.get("raw_text", "")
    if not skills_detected:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No skills could be extracted from this CV. Try a more detailed document.",
        )

    try:
        score_row = scoring_engine.compute_and_persist_score(
            cv_repo.client,
            current_user["user_id"],
            skills_detected,
            include_market_signals=False,
            require_skills_assessed=True,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CV skills could not be mapped to the skill taxonomy. Please revise and try again.",
        ) from exc
    now = datetime.now(timezone.utc).isoformat()
    cv_repo.update_cv_profile(
        current_user["user_id"],
        {
            "cv_raw_text": raw_text,
            "cv_parsed_at": now,
            "onboarding_complete": True,
        },
    )
    cv_repo.insert_cv_history(
        {
            "user_id": current_user["user_id"],
            "skills_count": len(skills_detected),
            "mirror_score": score_row["total_score"],
            "uploaded_at": now,
            "cv_raw_text": raw_text,
            "version_number": cv_repo.next_version_number(current_user["user_id"]),
            "version_type": "baseline_upload",
            "title": "Uploaded baseline CV",
            "evidence_count": 0,
        }
    )

    return CVUploadResponse(
        skills_detected=len(skills_detected),
        score=score_row["total_score"],
        redirect_to="/onboarding/score",
    )


@router.post("/text", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def submit_cv_text(
    body: CVTextRequest,
    current_user: dict = Depends(get_current_user),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVUploadResponse:
    assert_not_rate_limited(cv_repo.client, current_user["user_id"], "cv_history", "uploaded_at")

    raw_text = body.text.strip()
    if len(raw_text) < 80:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Please write at least a few sentences about yourself.",
        )

    parsed = await cv_parser.parse_cv_text(raw_text)
    skills_detected = parsed.get("skills_detected", [])
    if not skills_detected:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No skills could be identified from your description. Try adding more detail about your work and projects.",
        )

    try:
        score_row = scoring_engine.compute_and_persist_score(
            cv_repo.client,
            current_user["user_id"],
            skills_detected,
            include_market_signals=False,
            require_skills_assessed=True,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CV skills could not be mapped to the skill taxonomy. Please revise and try again.",
        ) from exc
    now = datetime.now(timezone.utc).isoformat()
    cv_repo.update_cv_profile(
        current_user["user_id"],
        {
            "cv_raw_text": raw_text,
            "cv_parsed_at": now,
            "onboarding_complete": True,
        },
    )
    cv_repo.insert_cv_history(
        {
            "user_id": current_user["user_id"],
            "skills_count": len(skills_detected),
            "mirror_score": score_row["total_score"],
            "uploaded_at": now,
            "cv_raw_text": raw_text,
            "version_number": cv_repo.next_version_number(current_user["user_id"]),
            "version_type": "baseline_upload",
            "title": "Uploaded baseline CV",
            "evidence_count": 0,
        }
    )

    return CVUploadResponse(
        skills_detected=len(skills_detected),
        score=score_row["total_score"],
        redirect_to="/onboarding/score",
    )
