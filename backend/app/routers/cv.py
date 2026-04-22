from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.database import get_supabase_admin
from app.deps import get_current_user
from app.schemas import CVUploadResponse
from app.services import cv_parser, scoring_engine
from app.services.rate_limit import assert_not_rate_limited

router = APIRouter(prefix="/cv", tags=["cv"])

ALLOWED_TYPES = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


class CVHistoryItem(BaseModel):
    id: int
    skills_count: int
    mirror_score: float
    uploaded_at: datetime
    cv_raw_text: str | None = None


class CVProfileResponse(BaseModel):
    cv_raw_text: str | None
    cv_parsed_at: datetime | None
    history: list[CVHistoryItem]


@router.get("/me", response_model=CVProfileResponse)
async def get_cv_profile(current_user: dict = Depends(get_current_user)) -> CVProfileResponse:
    db = get_supabase_admin()
    profile = (
        db.table("user_profiles")
        .select("cv_raw_text, cv_parsed_at")
        .eq("id", current_user["user_id"])
        .single()
        .execute()
    )
    history_result = (
        db.table("cv_history")
        .select("id, skills_count, mirror_score, uploaded_at, cv_raw_text")
        .eq("user_id", current_user["user_id"])
        .order("uploaded_at", desc=True)
        .limit(20)
        .execute()
    )
    return CVProfileResponse(
        cv_raw_text=profile.data.get("cv_raw_text") if profile.data else None,
        cv_parsed_at=profile.data.get("cv_parsed_at") if profile.data else None,
        history=[CVHistoryItem(**row) for row in history_result.data],
    )


@router.post("/upload", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_cv(
    file: UploadFile,
    current_user: dict = Depends(get_current_user),
) -> CVUploadResponse:
    db = get_supabase_admin()
    assert_not_rate_limited(db, current_user["user_id"], "cv_history", "uploaded_at")

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

    score_row = scoring_engine.compute_and_persist_score(
        db,
        current_user["user_id"],
        skills_detected,
        include_market_signals=False,
    )
    now = datetime.now(timezone.utc).isoformat()

    db.table("user_profiles").update({
        "cv_raw_text": raw_text,
        "cv_parsed_at": now,
        "onboarding_complete": True,
    }).eq("id", current_user["user_id"]).execute()

    db.table("cv_history").insert({
        "user_id": current_user["user_id"],
        "skills_count": len(skills_detected),
        "mirror_score": score_row["total_score"],
        "uploaded_at": now,
        "cv_raw_text": raw_text,
    }).execute()

    return CVUploadResponse(
        skills_detected=len(skills_detected),
        score=score_row["total_score"],
        redirect_to="/onboarding/score",
    )


class CVTextRequest(BaseModel):
    text: str


@router.post("/text", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def submit_cv_text(
    body: CVTextRequest,
    current_user: dict = Depends(get_current_user),
) -> CVUploadResponse:
    db = get_supabase_admin()
    assert_not_rate_limited(db, current_user["user_id"], "cv_history", "uploaded_at")

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

    score_row = scoring_engine.compute_and_persist_score(
        db,
        current_user["user_id"],
        skills_detected,
        include_market_signals=False,
    )
    now = datetime.now(timezone.utc).isoformat()

    db.table("user_profiles").update({
        "cv_raw_text": raw_text,
        "cv_parsed_at": now,
        "onboarding_complete": True,
    }).eq("id", current_user["user_id"]).execute()

    db.table("cv_history").insert({
        "user_id": current_user["user_id"],
        "skills_count": len(skills_detected),
        "mirror_score": score_row["total_score"],
        "uploaded_at": now,
        "cv_raw_text": raw_text,
    }).execute()

    return CVUploadResponse(
        skills_detected=len(skills_detected),
        score=score_row["total_score"],
        redirect_to="/onboarding/score",
    )
