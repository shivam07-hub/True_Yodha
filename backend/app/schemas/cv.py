from typing import Literal

from pydantic import BaseModel

# One vocabulary for the upload job's phase, declared once so the accepted
# response and the polled status cannot drift apart.
#
# `reading` and `structuring_cv` are NOT written by any code path today — raw
# text is extracted synchronously before the job is accepted, and the layout
# parse moved off the critical path (968a2380). They stay in the union because
# this type validates responses on the way OUT: a historical row still holding
# one of them must render, not 500. Clients narrate the phases that are actually
# emitted (`queued` → `finding_skills` → `saving` → `ready`/`failed`) and treat
# anything else as "work in progress".
CVUploadPhase = Literal[
    "queued", "reading", "finding_skills", "saving", "structuring_cv",
    "ready", "failed",
]


class CVUploadDoneResponse(BaseModel):
    """Synchronous hash-cache-hit response — no LLM call, no XP charge."""
    status: Literal["done"] = "done"
    skills_detected: int
    score: float | None = None
    redirect_to: str
    xp_charged: int = 0


class CVUploadAcceptedResponse(BaseModel):
    """Async path — LLM job queued. Client polls /cv/upload/status/{job_id}."""
    status: Literal["processing"] = "processing"
    job_id: str


class CVUploadFailedResponse(BaseModel):
    """Terminal idempotency replay — prior job failed and must not be re-polled."""
    status: Literal["failed"] = "failed"
    current_phase: Literal["failed"] = "failed"
    error_code: str | None = None
    error_detail: str | None = None
    xp_charged: int = 0
    xp_refunded: bool = False
    new_coin_balance: int | None = None
    redirect_to: str | None = None


class CVUploadResponse(BaseModel):
    """Discriminated union over upload outcomes.

    Frontends switch on `status`:
      - "done"       → take skills_detected/score directly
      - "processing" → poll GET /cv/upload/status/{job_id}
      - "failed"     → surface prior terminal failure and clear idempotency
    """
    status: Literal["done", "processing", "failed"]
    job_id: str | None = None
    skills_detected: int | None = None
    score: float | None = None
    current_phase: CVUploadPhase | None = None
    error_code: str | None = None
    error_detail: str | None = None
    redirect_to: str | None = None
    xp_charged: int | None = None
    xp_refunded: bool | None = None
    new_coin_balance: int | None = None


class CVUploadStatusResponse(BaseModel):
    """Polled job status. `status="processing"` means client should poll again."""
    status: Literal["processing", "done", "failed"]
    current_phase: CVUploadPhase | None = None
    analysis_kind: Literal["baseline", "profile_preview", "generated_baseline"] = "baseline"
    result_payload: dict | None = None
    baseline_version_id: int | None = None
    skills_detected: int | None = None
    score: float | None = None
    error_code: str | None = None
    error_detail: str | None = None
    xp_charged: int = 0
    xp_refunded: bool = False
    # Populated on terminal polls only — see `get_cv_upload_status`. A processing
    # poll answers `null` rather than paying a `user_profiles` read per tick.
    new_coin_balance: int | None = None
    # Job-creation timestamp (ISO), retained for upload lifecycle observability.
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
