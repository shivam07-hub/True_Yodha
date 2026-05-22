from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.schemas import CVUploadResponse
from app.services import cv_workflow

router = APIRouter()

ALLOWED_TYPES = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


class CVTextRequest(BaseModel):
    text: str


@router.post("/upload", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_cv(
    file: UploadFile,
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
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
    payload = await cv_workflow.ingest_uploaded_cv(
        cv_repo=cv_repo,
        user_id=principal.id,
        file_bytes=file_bytes,
        file_type=file_type,
    )
    return CVUploadResponse(**payload)


@router.post("/text", response_model=CVUploadResponse, status_code=status.HTTP_201_CREATED)
async def submit_cv_text(
    body: CVTextRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVUploadResponse:
    raw_text = body.text.strip()
    payload = await cv_workflow.ingest_cv_text(
        cv_repo=cv_repo,
        user_id=principal.id,
        raw_text=raw_text,
    )
    return CVUploadResponse(**payload)
