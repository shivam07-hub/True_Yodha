from datetime import date, datetime, timezone
import secrets
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.config import settings
from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.cv import CVRepository, get_token_cv_repository
from app.schemas import (
    CVUploadDoneResponse,
    CVUploadResponse,
    CVUploadStatusResponse,
)
from app.services import cv_workflow

router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB


_VALID_SOURCES = {"pdf_upload", "text_describe", "linkedin_pdf"}


def _normalize_source(value: str | None, default: str) -> str:
    if value and value in _VALID_SOURCES:
        return value
    return default


class CVTextRequest(BaseModel):
    text: str
    idempotency_key: str | None = None
    source: str | None = Field(default=None, max_length=40)


class CVUploadFallbackRequest(BaseModel):
    attempts: int = Field(..., ge=1, le=100)
    reason_code: str = Field(..., min_length=1, max_length=120)
    last_error: str | None = Field(default=None, max_length=1000)
    file_name: str | None = Field(default=None, max_length=260)
    file_mime: str | None = Field(default=None, max_length=180)
    file_size_bytes: int | None = Field(default=None, ge=0, le=25 * 1024 * 1024)
    route: str | None = Field(default=None, max_length=260)
    assignment_deadline: date | None = None


class CVUploadFallbackResponse(BaseModel):
    ticket_id: str
    support_token: str
    alternate_submission_url: str
    sla_hours: int = 12


@router.post(
    "/upload",
    response_model=CVUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={
        200: {"model": CVUploadDoneResponse, "description": "Hash cache hit — no LLM call, no XP charge"},
        202: {"model": CVUploadResponse, "description": "LLM job queued, or terminal idempotency replay"},
    },
)
async def upload_cv(
    file: UploadFile,
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    x_myro_cv_source: str | None = Header(default=None, alias="X-Myro-CV-Source"),
) -> CVUploadResponse:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "unsupported_format", "message": "Only PDF and DOCX files are accepted."},
            headers={"X-Myro-Error-Code": "unsupported_format"},
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "file_too_large", "message": "File too large — maximum size is 10MB."},
            headers={"X-Myro-Error-Code": "file_too_large"},
        )

    file_type = "pdf" if file.content_type == "application/pdf" else "docx"
    source = _normalize_source(x_myro_cv_source, default="pdf_upload")
    payload = await cv_workflow.start_cv_upload_job(
        cv_repo=cv_repo,
        user_id=principal.id,
        file_bytes=file_bytes,
        file_type=file_type,
        idempotency_key=idempotency_key,
        source=source,
    )
    return CVUploadResponse(**payload)


@router.post(
    "/text",
    response_model=CVUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def submit_cv_text(
    body: CVTextRequest,
    principal: Principal = Depends(get_principal),
    cv_repo: CVRepository = Depends(get_token_cv_repository),
) -> CVUploadResponse:
    raw_text = body.text.strip()
    source = _normalize_source(body.source, default="text_describe")
    payload = await cv_workflow.start_cv_upload_job_from_text(
        cv_repo=cv_repo,
        user_id=principal.id,
        raw_text=raw_text,
        idempotency_key=body.idempotency_key,
        source=source,
    )
    return CVUploadResponse(**payload)


@router.get(
    "/upload/status/{job_id}",
    response_model=CVUploadStatusResponse,
)
async def upload_status(
    job_id: str,
    principal: Principal = Depends(get_principal),
) -> CVUploadStatusResponse:
    """Poll terminal state of an async CV upload job (ADR-0004)."""
    payload = await cv_workflow.get_cv_upload_status(job_id, principal.id)
    return CVUploadStatusResponse(**payload)


@router.post(
    "/upload/fallback",
    response_model=CVUploadFallbackResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_upload_fallback_submission(
    body: CVUploadFallbackRequest,
    principal: Principal = Depends(get_principal),
) -> CVUploadFallbackResponse:
    support_token = f"CV-{secrets.token_hex(4).upper()}"
    ticket_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    get_supabase_admin().table("cv_upload_fallback_requests").insert({
        "id": ticket_id,
        "user_id": principal.id,
        "support_token": support_token,
        "attempts": body.attempts,
        "reason_code": body.reason_code,
        "last_error": body.last_error,
        "file_name": body.file_name,
        "file_mime": body.file_mime,
        "file_size_bytes": body.file_size_bytes,
        "route": body.route,
        "assignment_deadline": body.assignment_deadline.isoformat() if body.assignment_deadline else None,
        "status": "open",
        "created_at": now,
        "updated_at": now,
    }).execute()

    if settings.cv_upload_fallback_form_url.strip():
        alternate_url = settings.cv_upload_fallback_form_url.strip()
    else:
        subject = quote(f"Myro CV upload fallback {support_token}")
        alternate_url = f"mailto:{settings.cv_upload_support_email}?subject={subject}"

    return CVUploadFallbackResponse(
        ticket_id=ticket_id,
        support_token=support_token,
        alternate_submission_url=alternate_url,
        sla_hours=12,
    )
