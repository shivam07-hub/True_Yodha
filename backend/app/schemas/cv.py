from typing import Literal

from pydantic import BaseModel


class CVUploadDoneResponse(BaseModel):
    """Synchronous hash-cache-hit response — no LLM call, no XP charge."""
    status: Literal["done"] = "done"
    skills_detected: int
    score: float
    redirect_to: str
    xp_charged: int = 0


class CVUploadAcceptedResponse(BaseModel):
    """Async path — LLM job queued. Client polls /cv/upload/status/{job_id}."""
    status: Literal["processing"] = "processing"
    job_id: str


class CVUploadResponse(BaseModel):
    """Discriminated union over the two upload outcomes.

    Frontends switch on `status`:
      - "done"       → take skills_detected/score directly
      - "processing" → poll GET /cv/upload/status/{job_id}
    """
    status: Literal["done", "processing"]
    job_id: str | None = None
    skills_detected: int | None = None
    score: float | None = None
    redirect_to: str | None = None
    xp_charged: int | None = None


class CVUploadStatusResponse(BaseModel):
    """Polled job status. `status="processing"` means client should poll again."""
    status: Literal["processing", "done", "failed"]
    skills_detected: int | None = None
    score: float | None = None
    error_code: str | None = None
    error_detail: str | None = None
    xp_charged: int = 0
    xp_refunded: bool = False
    new_xp_balance: int
    # Job-creation timestamp (ISO). Anchors the 10-min CV-promise countdown.
    started_at: str | None = None
    redirect_to: str | None = None


class CVEvidenceSummaryResponse(BaseModel):
    evidence_count: int
    diary_entries_count: int
    skill_upgrades_count: int
    score_delta: float | None
    current_score: float | None
    last_cv_score: float | None
    next_version_number: int
