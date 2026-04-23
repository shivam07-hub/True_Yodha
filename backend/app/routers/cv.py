from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.database import get_supabase_admin
from app.deps import get_current_user
from app.schemas import (
    CVEvidenceItem,
    CVEvidenceSummaryResponse,
    CVGenerateDraftResponse,
    CVSaveDraftRequest,
    CVUploadResponse,
)
from app.services import cv_builder, cv_parser, scoring_engine
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
    version_number: int = 1
    version_type: str = "baseline_upload"
    title: str | None = None
    evidence_count: int = 0


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
        .select("*")
        .eq("user_id", current_user["user_id"])
        .order("uploaded_at", desc=True)
        .limit(20)
        .execute()
    )
    return CVProfileResponse(
        cv_raw_text=profile.data.get("cv_raw_text") if profile.data else None,
        cv_parsed_at=profile.data.get("cv_parsed_at") if profile.data else None,
        history=[_to_cv_history_item(row) for row in history_result.data],
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
        "version_number": _next_cv_version_number(db, current_user["user_id"]),
        "version_type": "baseline_upload",
        "title": "Uploaded baseline CV",
        "evidence_count": 0,
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
        "version_number": _next_cv_version_number(db, current_user["user_id"]),
        "version_type": "baseline_upload",
        "title": "Uploaded baseline CV",
        "evidence_count": 0,
    }).execute()

    return CVUploadResponse(
        skills_detected=len(skills_detected),
        score=score_row["total_score"],
        redirect_to="/onboarding/score",
    )


@router.get("/evidence", response_model=CVEvidenceSummaryResponse)
async def get_cv_evidence(current_user: dict = Depends(get_current_user)) -> CVEvidenceSummaryResponse:
    db = get_supabase_admin()
    return _build_evidence_summary(db, current_user["user_id"])


@router.post("/generate-draft", response_model=CVGenerateDraftResponse, status_code=status.HTTP_201_CREATED)
async def generate_next_cv_draft(current_user: dict = Depends(get_current_user)) -> CVGenerateDraftResponse:
    db = get_supabase_admin()
    user_id = current_user["user_id"]
    profile = db.table("user_profiles").select("cv_raw_text").eq("id", user_id).single().execute()
    latest = _latest_cv_version(db, user_id)
    baseline_text = (latest or {}).get("cv_raw_text") or (profile.data or {}).get("cv_raw_text")
    if not baseline_text:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload a baseline CV first.")

    summary = _build_evidence_summary(db, user_id)
    if not summary.eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Complete {summary.required_count} milestone days before generating the next CV draft.",
        )

    cv_text = cv_builder.build_cv_draft(
        baseline_text=baseline_text,
        evidence_items=[item.model_dump() for item in summary.evidence],
        version_number=summary.next_version_number,
        score_delta=summary.score_delta,
    )
    now = datetime.now(timezone.utc).isoformat()
    user_skills = db.table("user_skills").select("id").eq("user_id", user_id).execute()
    draft_score = summary.current_score if summary.current_score is not None else summary.last_cv_score
    payload = {
        "user_id": user_id,
        "skills_count": len(user_skills.data or []),
        "mirror_score": draft_score if draft_score is not None else 0,
        "uploaded_at": now,
        "cv_raw_text": cv_text,
        "version_number": summary.next_version_number,
        "version_type": "generated_draft",
        "title": f"Generated CV draft v{summary.next_version_number}",
        "evidence_snapshot": [item.model_dump() for item in summary.evidence],
        "evidence_count": summary.evidence_count,
    }
    insert_result = db.table("cv_history").insert(payload).execute()
    row = insert_result.data[0] if insert_result.data else _latest_cv_version(db, user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="CV draft was generated but could not be stored.")
    return CVGenerateDraftResponse(
        version_id=row["id"],
        version_number=row.get("version_number") or summary.next_version_number,
        cv_text=cv_text,
        evidence_count=summary.evidence_count,
        score_delta=summary.score_delta,
    )


@router.post("/save-draft", response_model=CVGenerateDraftResponse, status_code=status.HTTP_201_CREATED)
async def save_generated_cv_draft(
    body: CVSaveDraftRequest,
    current_user: dict = Depends(get_current_user),
) -> CVGenerateDraftResponse:
    db = get_supabase_admin()
    user_id = current_user["user_id"]
    cv_text = body.cv_text.strip()
    if len(cv_text) < 120:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Draft is too short to save. Generate and review a fuller CV draft.",
        )

    profile = db.table("user_profiles").select("cv_raw_text").eq("id", user_id).single().execute()
    latest = _latest_cv_version(db, user_id)
    baseline_text = (latest or {}).get("cv_raw_text") or (profile.data or {}).get("cv_raw_text")
    if not baseline_text:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload a baseline CV first.")

    summary = _build_evidence_summary(db, user_id)
    if not summary.eligible:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Complete {summary.required_count} milestone days before saving the next CV draft.",
        )

    now = datetime.now(timezone.utc).isoformat()
    user_skills = db.table("user_skills").select("id").eq("user_id", user_id).execute()
    draft_score = summary.current_score if summary.current_score is not None else summary.last_cv_score
    payload = {
        "user_id": user_id,
        "skills_count": len(user_skills.data or []),
        "mirror_score": draft_score if draft_score is not None else 0,
        "uploaded_at": now,
        "cv_raw_text": cv_text,
        "version_number": summary.next_version_number,
        "version_type": "generated_draft",
        "title": f"Generated CV draft v{summary.next_version_number}",
        "evidence_snapshot": [item.model_dump() for item in summary.evidence],
        "evidence_count": summary.evidence_count,
    }
    insert_result = db.table("cv_history").insert(payload).execute()
    row = insert_result.data[0] if insert_result.data else _latest_cv_version(db, user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Draft was reviewed but could not be stored.")
    return CVGenerateDraftResponse(
        version_id=row["id"],
        version_number=row.get("version_number") or summary.next_version_number,
        cv_text=cv_text,
        evidence_count=summary.evidence_count,
        score_delta=summary.score_delta,
    )


def _to_cv_history_item(row: dict) -> CVHistoryItem:
    return CVHistoryItem(
        id=row["id"],
        skills_count=row.get("skills_count") or 0,
        mirror_score=row.get("mirror_score") or 0,
        uploaded_at=row["uploaded_at"],
        cv_raw_text=row.get("cv_raw_text"),
        version_number=row.get("version_number") or 1,
        version_type=row.get("version_type") or "baseline_upload",
        title=row.get("title"),
        evidence_count=row.get("evidence_count") or 0,
    )


def _next_cv_version_number(db, user_id: str) -> int:
    result = (
        db.table("cv_history")
        .select("version_number")
        .eq("user_id", user_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return 1
    return int(result.data[0].get("version_number") or 0) + 1


def _latest_cv_version(db, user_id: str) -> dict | None:
    result = (
        db.table("cv_history")
        .select("*")
        .eq("user_id", user_id)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_date(value: str | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _build_evidence_summary(db, user_id: str) -> CVEvidenceSummaryResponse:
    latest = _latest_cv_version(db, user_id)
    since_dt = _parse_datetime((latest or {}).get("uploaded_at"))
    since_date = since_dt.date() if since_dt else None

    milestones_result = (
        db.table("user_milestones")
        .select("*")
        .eq("user_id", user_id)
        .order("milestone_date", desc=True)
        .limit(120)
        .execute()
    )
    completed_rows = []
    for row in milestones_result.data or []:
        completed_at = _parse_datetime(row.get("completed_at"))
        if not completed_at:
            continue
        if since_dt and completed_at <= since_dt:
            continue
        completed_rows.append(row)

    completed_rows.sort(key=lambda item: item.get("milestone_date") or "")
    evidence = [
        CVEvidenceItem(**cv_builder.normalize_evidence({**row, "date": row.get("milestone_date")}))
        for row in completed_rows
    ]
    evidence_days = {item.date for item in evidence if item.date}

    diary_result = (
        db.table("daily_logs")
        .select("id, log_date")
        .eq("user_id", user_id)
        .order("log_date", desc=True)
        .limit(120)
        .execute()
    )
    diary_entries_count = 0
    for row in diary_result.data or []:
        log_date = _parse_date(row.get("log_date"))
        if log_date and (since_date is None or log_date > since_date):
            diary_entries_count += 1

    upgrades_result = (
        db.table("user_skills")
        .select("id, source, last_updated")
        .eq("user_id", user_id)
        .execute()
    )
    skill_upgrades_count = 0
    for row in upgrades_result.data or []:
        updated_at = _parse_datetime(row.get("last_updated"))
        if row.get("source") == "diary" and (since_dt is None or (updated_at and updated_at > since_dt)):
            skill_upgrades_count += 1

    score_result = db.table("mirror_scores").select("total_score").eq("user_id", user_id).maybe_single().execute()
    current_score = score_result.data.get("total_score") if score_result and score_result.data else None
    last_cv_score = (latest or {}).get("mirror_score")
    score_delta = None
    if current_score is not None and last_cv_score is not None:
        score_delta = float(current_score) - float(last_cv_score)

    missing_prompts = [
        prompt for prompt in (cv_builder.evidence_missing_prompt(item.model_dump()) for item in evidence)
        if prompt
    ][:3]

    return CVEvidenceSummaryResponse(
        eligible=len(evidence_days) >= cv_builder.REQUIRED_EVIDENCE_DAYS,
        required_count=cv_builder.REQUIRED_EVIDENCE_DAYS,
        evidence_count=len(evidence_days),
        diary_entries_count=diary_entries_count,
        skill_upgrades_count=skill_upgrades_count,
        score_delta=score_delta,
        current_score=current_score,
        last_cv_score=last_cv_score,
        next_version_number=_next_cv_version_number(db, user_id),
        evidence=evidence,
        missing_detail_prompts=missing_prompts,
    )
