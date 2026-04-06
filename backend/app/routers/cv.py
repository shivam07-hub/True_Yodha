from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.database import get_supabase_admin
from app.deps import get_current_user
from app.schemas import CVUploadResponse
from app.services import cv_parser, scoring_engine

router = APIRouter(prefix="/cv", tags=["cv"])

ALLOWED_TYPES = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


@router.post("/upload", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_cv(
    file: UploadFile,
    current_user: dict = Depends(get_current_user),
) -> CVUploadResponse:
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

    if not skills_detected:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No skills could be extracted from this CV. Try a more detailed document.",
        )

    db = get_supabase_admin()
    score_row = scoring_engine.compute_and_persist_score(db, current_user["user_id"], skills_detected)

    # Mark CV as parsed on user profile
    db.table("user_profiles").update({
        "cv_parsed_at": score_row.get("computed_at"),
    }).eq("id", current_user["user_id"]).execute()

    return CVUploadResponse(
        skills_detected=len(skills_detected),
        score=score_row["total_score"],
        redirect_to="/onboarding/score",
    )
