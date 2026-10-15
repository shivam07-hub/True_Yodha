"""Filing: the Yes, the company-page receipt, and answers from the CV."""

from __future__ import annotations

import base64
import binascii
import re
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.career_profile import CareerProfileRepository, get_career_profile_repository
from app.repositories.connections import ConnectionsRepository, get_token_connections_repository
from app.repositories.job_filing import JobFilingRepository, get_job_filing_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import core_loop, cv_of_record
from app.services.apply_filing import (
    HOLD_REASONS,
    as_cv_id,
    decide,
    receipt_block,
    with_stored_cv,
)
from app.services.filing_answers import FormQuestion, answer_questions
from app.services.filing_notes import motion_match, written_to_choices
from app.services.llm_provider import get_writer_provider
from app.services.matching import on_demand
from app.services.reach_intel import build_reach_intel

router = APIRouter()


class FilingResponse(BaseModel):
    job_id: str
    ready: bool
    blocks: list[str]
    authorized: bool
    judge_score: float | None = None
    cv_version_id: int | None = None
    hold_reason: str | None = None
    received: bool = False


class FilingYesRequest(BaseModel):
    yes: bool


class FilingHoldRequest(BaseModel):
    reason: str


class FilingReceiptRequest(BaseModel):
    receipt_url: str = Field(min_length=8, max_length=2000)
    receipt_text: str = Field(min_length=12, max_length=2000)


class FilingReceiptResponse(BaseModel):
    applied: bool
    blocks: list[str]


class FilingQuestionIn(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=300)
    options: list[str] = Field(default_factory=list, max_length=20)


class FilingResumeRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=120)
    pdf_base64: str = Field(min_length=16, max_length=2_000_000)


class FilingNote(BaseModel):
    full_name: str
    position: str


class FilingNotesResponse(BaseModel):
    applied: bool
    has_export: bool
    company: str
    written_to: list[FilingNote]
    motion_match: FilingNote | None
    motion: str


class FilingAnswersRequest(BaseModel):
    questions: list[FilingQuestionIn] = Field(max_length=12)


class FilingAnswerOut(BaseModel):
    id: str
    label: str
    answer: str
    source: str


class FilingAnswersResponse(BaseModel):
    answers: list[FilingAnswerOut]
    blocks: list[str]


def _response(
    job_id: str,
    repo: JobFilingRepository,
    principal: Principal,
    *,
    yes: bool | None,
) -> FilingResponse:
    facts = repo.facts(principal.id, job_id)
    if facts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    decision = decide(facts, now=datetime.now(timezone.utc), yes=yes)
    if (
        yes is True
        and decision.ready
        and decision.cv_version_id is not None
        and decision.judge_score is not None
    ):
        repo.save_authorization(
            user_id=principal.id,
            job_id=job_id,
            cv_version_id=decision.cv_version_id,
            judge_score=decision.judge_score,
        )
    auth = repo.authorization_for(principal.id, job_id)
    current = with_stored_cv(decision, as_cv_id((auth or {}).get("cv_version_id")))
    return FilingResponse(
        job_id=job_id,
        ready=current.ready,
        blocks=list(current.blocks),
        authorized=auth is not None,
        judge_score=current.judge_score,
        cv_version_id=current.cv_version_id,
        hold_reason=(auth or {}).get("hold_reason"),
        received=bool((auth or {}).get("received_at")),
    )


def _open_authorization(repo: JobFilingRepository, principal: Principal, job_id: str):
    facts = repo.facts(principal.id, job_id)
    if facts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    auth = repo.authorization_for(principal.id, job_id)
    if auth is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Filing waits for a yes on this CV.",
        )
    decision = with_stored_cv(
        decide(facts, now=datetime.now(timezone.utc), yes=True),
        as_cv_id(auth.get("cv_version_id")),
    )
    return facts, auth, decision


def _commit_applied(
    jobs: JobsRepository,
    background_tasks: BackgroundTasks,
    *,
    user_id: str,
    job_id: str,
) -> None:
    """The applied writes. Same door as the tracker, surface filing_receipt."""
    now = datetime.now(timezone.utc).isoformat()
    existing = jobs.get_application_with_job(user_id, job_id) or {}
    prior = existing.get("status")
    updates: dict = {"status": "applied", "applied_at": now}
    if prior != "applied":
        updates["last_stage_changed_at"] = now
    jobs.upsert_application(user_id, job_id, updates)
    jobs.answer_apply_intents(user_id, job_id)
    if prior != "applied":
        cv_of_record.record_on_apply(user_id, job_id)
        background_tasks.add_task(on_demand.open_job_eval, jobs, user_id, job_id)
        background_tasks.add_task(
            core_loop.record_step, user_id, job_id, "applied", "filing_receipt"
        )


@router.get("/{job_id}/filing", response_model=FilingResponse)
def get_filing(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
) -> FilingResponse:
    return _response(job_id, repo, principal, yes=None)


@router.post("/{job_id}/filing", response_model=FilingResponse)
def approve_filing(
    job_id: str,
    body: FilingYesRequest,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
) -> FilingResponse:
    return _response(job_id, repo, principal, yes=body.yes)


@router.post("/{job_id}/filing/hold", response_model=FilingResponse)
def hold_filing(
    job_id: str,
    body: FilingHoldRequest,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
) -> FilingResponse:
    if body.reason not in HOLD_REASONS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown hold.")
    facts = repo.facts(principal.id, job_id)
    if facts is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    auth = repo.authorization_for(principal.id, job_id)
    if auth is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Filing waits for a yes on this CV.",
        )
    repo.save_hold(user_id=principal.id, job_id=job_id, reason=body.reason)
    return _response(job_id, repo, principal, yes=None)


@router.post("/{job_id}/filing/receipt", response_model=FilingReceiptResponse)
def receive_filing(
    job_id: str,
    body: FilingReceiptRequest,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
    jobs: JobsRepository = Depends(get_token_jobs_repository),
) -> FilingReceiptResponse:
    facts, _auth, decision = _open_authorization(repo, principal, job_id)
    if not decision.ready:
        return FilingReceiptResponse(applied=False, blocks=list(decision.blocks))
    block = receipt_block(
        urls=[
            str(facts.listing.get("apply_url") or ""),
            str(facts.listing.get("source_url") or ""),
        ],
        receipt_url=body.receipt_url,
        receipt_text=body.receipt_text,
    )
    if block:
        return FilingReceiptResponse(applied=False, blocks=[block])
    repo.save_receipt(
        user_id=principal.id,
        job_id=job_id,
        receipt_url=body.receipt_url,
        receipt_text=body.receipt_text,
    )
    _commit_applied(jobs, background_tasks, user_id=principal.id, job_id=job_id)
    return FilingReceiptResponse(applied=True, blocks=[])


@router.post("/{job_id}/filing/answers", response_model=FilingAnswersResponse)
async def filing_answers(
    job_id: str,
    body: FilingAnswersRequest,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
    profiles: CareerProfileRepository = Depends(get_career_profile_repository),
) -> FilingAnswersResponse:
    _facts, _auth, decision = _open_authorization(repo, principal, job_id)
    if not decision.ready or decision.cv_version_id is None:
        return FilingAnswersResponse(answers=[], blocks=list(decision.blocks))
    cv = repo.tailored_cv(principal.id, decision.cv_version_id)
    if cv is None:
        return FilingAnswersResponse(answers=[], blocks=["no_tailored_cv"])
    stored, _updated = profiles.get(principal.id)
    profile = stored if isinstance(stored, dict) else {}
    drafted = await answer_questions(
        structured=cv.get("cv_structured") if isinstance(cv.get("cv_structured"), dict) else None,
        body_text=str(cv.get("body_text") or ""),
        questions=[
            FormQuestion(
                id=item.id,
                label=item.label,
                options=tuple(option.strip() for option in item.options if option.strip())[:20],
            )
            for item in body.questions
        ],
        complete=_complete,
        profile=profile,
    )
    if body.questions and any(not item.answer for item in drafted):
        repo.save_hold(user_id=principal.id, job_id=job_id, reason="unanswered")
    elif body.questions:
        repo.save_hold(user_id=principal.id, job_id=job_id, reason=None)
    return FilingAnswersResponse(
        answers=[
            FilingAnswerOut(id=item.id, label=item.label, answer=item.answer, source=item.source)
            for item in drafted
        ],
        blocks=[],
    )


def _pdf_bytes(raw: str) -> bytes:
    try:
        data = base64.b64decode(raw, validate=True)
    except binascii.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The CV file is not a PDF.",
        ) from exc
    if len(data) > 1_500_000 or not data.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The CV file is not a PDF.",
        )
    return data


def _pdf_name(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", raw.strip()).strip("._-") or "cv.pdf"
    if not cleaned.lower().endswith(".pdf"):
        cleaned = re.sub(r"\.(pdf|docx)$", "", cleaned, flags=re.IGNORECASE) + ".pdf"
    return cleaned[:120]


@router.post("/{job_id}/filing/resume", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def store_filing_resume(
    job_id: str,
    body: FilingResumeRequest,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
) -> None:
    _facts, _auth, decision = _open_authorization(repo, principal, job_id)
    if not decision.ready:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Filing waits for a yes on this CV.",
        )
    data = _pdf_bytes(body.pdf_base64)
    repo.save_resume(
        user_id=principal.id,
        job_id=job_id,
        resume_pdf=base64.b64encode(data).decode("ascii"),
        resume_filename=_pdf_name(body.filename),
    )


@router.get("/{job_id}/filing/resume")
def read_filing_resume(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
) -> Response:
    _facts, _auth, decision = _open_authorization(repo, principal, job_id)
    if not decision.ready:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Filing waits for a yes on this CV.",
        )
    row = repo.resume_for(principal.id, job_id)
    raw = row.get("resume_pdf") if row else None
    if not raw:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="resume_unrendered")
    try:
        data = base64.b64decode(raw, validate=True)
    except binascii.Error as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="resume_unrendered") from exc
    name = _pdf_name(str((row or {}).get("resume_filename") or "cv.pdf"))
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{job_id}/filing/notes", response_model=FilingNotesResponse)
def filing_notes(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobFilingRepository = Depends(get_job_filing_repository),
    jobs_repo: JobsRepository = Depends(get_token_jobs_repository),
    connections: ConnectionsRepository = Depends(get_token_connections_repository),
) -> FilingNotesResponse:
    """The two notes after confirmation: one the person marks as already
    written to, and the connection whose seat is the motion. Both from the
    person's own export. Empty until the application is confirmed."""
    auth = repo.authorization_for(principal.id, job_id)
    applied = bool((auth or {}).get("received_at"))
    meta = jobs_repo.get_jobs_by_ids([job_id])
    company = str((meta[0].get("company_name") if meta else "") or "")
    if not applied:
        return FilingNotesResponse(
            applied=False, has_export=connections.count(principal.id) > 0,
            company=company, written_to=[], motion_match=None, motion="",
        )
    rows = connections.find_at_company(principal.id, company, limit=25) if company else []
    intel = build_reach_intel(
        job_title=str((meta[0].get("job_title") if meta else "") or ""),
        job_description=str((meta[0].get("job_description") if meta else "") or ""),
        company=company or None,
    )
    matched = motion_match(rows, function=intel.function, target_titles=intel.target_titles)
    return FilingNotesResponse(
        applied=True,
        has_export=connections.count(principal.id) > 0,
        company=company,
        written_to=[FilingNote(full_name=c.full_name, position=c.position) for c in written_to_choices(rows)],
        motion_match=FilingNote(full_name=matched.full_name, position=matched.position) if matched else None,
        motion=intel.function or (intel.target_titles[0] if intel.target_titles else ""),
    )


async def _complete(messages: list[dict[str, str]]) -> str:
    return await get_writer_provider().complete(messages, max_tokens=400, temperature=0)
