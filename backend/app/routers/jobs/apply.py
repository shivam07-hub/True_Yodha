import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.security import redact_sensitive_text
from app.schemas import (
    APPLICATION_STATUSES,
    ApplyIntentRequest,
    ApplicationPriorityUpdate,
    ApplicationResponse,
    ApplicationStatusUpdate,
    JobFileExtractResponse,
    JobImportPreviewRequest,
    JobImportPreviewResponse,
    JobImportRequest,
    JobImportedDetailsResponse,
    JobImportedDetailsUpdate,
    JobLivenessResponse,
    MatchEval,
    JobUrlExtractRequest,
)
from app.services import job_liveness, jobs_workflow, xp_service
from app.services.job_extract_backstop import backfill_fields, is_valid_company, is_valid_role
from app.services.cv_parser import extract_raw_text
from app.services.job_file_parser import (
    MAX_FILE_BYTES,
    MIN_TEXT_CHARS,
    JobFileParseError,
    detect_file_kind,
    extract_job_from_image,
    extract_job_from_text,
    extract_job_from_url,
)
from app.services.llm_provider import get_llm_provider, get_vision_provider
from app.services.xp_policy import ADD_JOB_REWARD_XP

from app.services.job_projection import cv_badge_from_row, to_application

_log = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{job_id}/apply-intents", status_code=status.HTTP_204_NO_CONTENT)
def record_apply_intent(
    job_id: str,
    body: ApplyIntentRequest,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    repo.record_apply_intent(
        principal.id,
        job_id,
        {
            "client_event_id": str(body.client_event_id),
            "surface": body.surface,
            "destination_type": body.destination_type,
        },
    )
    # An apply is the strongest liveness signal we get for free: someone is
    # about to spend real effort on this listing. Re-verify it out of band so the
    # corpus learns from intent, without adding latency to the click.
    background_tasks.add_task(_verify_after_intent, job_id)


async def _verify_after_intent(job_id: str) -> None:
    try:
        await job_liveness.check_liveness(get_supabase_admin(), job_id)
    except Exception:  # noqa: BLE001 — best-effort; the apply already happened
        _log.warning("metric job_liveness.intent_check_failed job_id=%s", job_id, exc_info=True)


@router.get("/{job_id}/liveness", response_model=JobLivenessResponse)
async def get_job_liveness(
    job_id: str,
    force: bool = False,
    principal: Principal = Depends(get_principal),
) -> JobLivenessResponse:
    """Is this listing still live? Checked now if the last verdict is stale.

    The intent gate: called when a user opens or is about to act on a job, so a
    ghost listing is caught at the one moment it would cost them effort. Cached
    ~6h, so repeated opens in a session cost one fetch.
    """
    verdict = await job_liveness.check_liveness(
        get_supabase_admin(), job_id, force=force
    )
    if verdict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return JobLivenessResponse(
        job_id=verdict.job_id,
        state=verdict.state,
        checked_at=verdict.checked_at,
        verified_live_at=verdict.verified_live_at,
        from_cache=verdict.from_cache,
    )


@router.get("/applications", response_model=list[ApplicationResponse])
def get_applications(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
) -> list[ApplicationResponse]:
    """Tracker list. Each row carries `cv_badge` for its Company CV Thread head.

    Threads are derived (CONTEXT.md → Company CV Thread). One batched read across
    all distinct companies on this page avoids the N+1 per-card fetch.
    """
    rows = repo.get_user_applications(principal.id)
    companies = [(row.get("jobs") or {}).get("company_name") for row in rows]
    latest_by_company = cv_repo.latest_for_thread_batch(
        principal.id,
        [c for c in companies if c],
    )
    match_evals = repo.get_cached_match_evals(
        principal.id,
        [str(row.get("job_id") or "") for row in rows],
    )
    # One CV-skill read powers the ✓/✗ chip split for every tracked card (esp.
    # extension-added jobs, which carry no precomputed match).
    skill_keys = repo.user_skill_keys(principal.id)
    out: list[ApplicationResponse] = []
    for row in rows:
        company = (row.get("jobs") or {}).get("company_name")
        match_row = match_evals.get(str(row.get("job_id") or ""))
        out.append(
            to_application(
                row,
                cv_badge_from_row(latest_by_company.get(company)),
                skill_keys,
                MatchEval.model_validate(match_row).match_score if match_row else None,
            )
        )
    return out


@router.post("/import/preview", response_model=JobImportPreviewResponse)
async def preview_job_import(
    body: JobImportPreviewRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobImportPreviewResponse:
    if not body.job_description.strip():
        raise HTTPException(status_code=422, detail="Job description is required.")
    # Hybrid extraction: fill/validate role/company/location server-side when the
    # client flagged a weak field, so the preview the user confirms is clean.
    filled = await backfill_fields(
        role_name=body.role_name,
        company_name=body.company_name,
        location=body.location,
        job_description=body.job_description,
        json_ld=body.json_ld,
        needs_backstop=body.needs_backstop,
    )
    preview = jobs_workflow.preview_imported_job(repo, body)
    preview.update({k: v for k, v in filled.items() if v})
    # Extension scored hook (#34 S5): deterministic fit of the previewed skills
    # vs the caller's CV — same primary=2/secondary=1 weighting as fit-batch, no
    # persist. Lets the popup show "Ready N/100 + top gaps" the moment the JD is
    # captured, then deep-link into the report.
    user_lower = {k.lower(): v for k, v in repo.get_user_skill_map(principal.id).items()}
    preview.update(_preview_fit(
        preview.get("primary_skills") or [],
        preview.get("secondary_skills") or [],
        user_lower,
    ))
    return JobImportPreviewResponse(**preview)


def _preview_fit(primary: list, secondary: list, user_lower: dict[str, int]) -> dict:
    """Deterministic overlap of previewed job skills against the caller's CV.
    Mirrors analyse._compute_overlap (primary weight 2, secondary 1). Returns a
    null readiness when no taxonomy skills resolved — "unknown fit", not "no fit"."""
    def key(s) -> str:
        return ((s.get("taxonomy_key") if isinstance(s, dict) else getattr(s, "taxonomy_key", None)) or "").lower()

    def label(s) -> str:
        return (s.get("label") if isinstance(s, dict) else getattr(s, "label", "")) or ""

    p = [s for s in primary if key(s)]
    sec = [s for s in secondary if key(s)]
    max_possible = 2 * len(p) + len(sec)
    if not max_possible:
        return {"readiness_pct": None, "matched_skills": [], "top_gaps": []}
    p_hit = [s for s in p if key(s) in user_lower]
    s_hit = [s for s in sec if key(s) in user_lower]
    score = round((2 * len(p_hit) + len(s_hit)) / max_possible * 100, 1)
    matched = list({label(s) for s in p_hit + s_hit})
    gaps = [label(s) for s in p if key(s) not in user_lower][:2]
    return {"readiness_pct": score, "matched_skills": matched, "top_gaps": gaps}


@router.post("/import/extract-file", response_model=JobFileExtractResponse)
async def extract_job_file(
    file: UploadFile = File(...),
    principal: Principal = Depends(get_principal),
) -> JobFileExtractResponse:
    """Parse an uploaded job posting (PDF / DOCX / screenshot) into tracker fields.

    Free — no XP charge. PDF/DOCX reuse the CV text extractor; images go through
    a vision LLM. The reward is granted later, on POST /import (the save).
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="The file is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large — keep it under 8 MB.")

    kind = detect_file_kind(file.content_type, file.filename, data)
    try:
        if kind in ("pdf", "docx"):
            raw_text = extract_raw_text(data, kind)
            if len(raw_text.strip()) < MIN_TEXT_CHARS:
                raise HTTPException(
                    status_code=422,
                    detail="No readable text in that file. If it's a scan, upload it as an image instead.",
                )
            parsed = await extract_job_from_text(raw_text, get_llm_provider())
        elif kind == "image":
            parsed = await extract_job_from_image(data, file.content_type or "image/png", get_vision_provider())
        else:
            raise HTTPException(status_code=422, detail="Unsupported file — upload a PDF, Word doc, or an image.")
    except JobFileParseError as exc:
        raise HTTPException(status_code=422, detail=redact_sensitive_text(exc)) from exc

    return JobFileExtractResponse(**parsed)


@router.post("/import/extract-url", response_model=JobFileExtractResponse)
async def extract_job_url(
    body: JobUrlExtractRequest,
    principal: Principal = Depends(get_principal),
) -> JobFileExtractResponse:
    """Fetch a public job-posting URL and parse it into tracker fields.

    Free — no XP charge, same as extract-file. SSRF-guarded: only public http(s)
    hosts are fetched, re-validated on every redirect hop. The reward is granted
    later, on POST /import (the save).
    """
    if not body.url.strip():
        raise HTTPException(status_code=422, detail="Paste a job posting link first.")
    try:
        parsed = await extract_job_from_url(body.url, get_llm_provider())
    except JobFileParseError as exc:
        raise HTTPException(status_code=422, detail=redact_sensitive_text(exc)) from exc
    return JobFileExtractResponse(**parsed)


@router.post("/import", response_model=ApplicationResponse)
async def import_job(
    body: JobImportRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if not body.role_name.strip() or not body.job_description.strip():
        raise HTTPException(status_code=422, detail="Role name and job description are required.")
    saved = jobs_workflow.save_imported_job(repo, principal.id, body)

    # +XP for tracking a job. Idempotent per application id (reward_xp scans the
    # ledger), so a retried save never double-credits. A reward failure must not
    # fail the save — the job is already persisted.
    try:
        new_balance = await xp_service.reward(
            principal.id,
            ADD_JOB_REWARD_XP,
            "add_job",
            "Added a job to the tracker",
            ref_table="job_applications",
            ref_id=str(saved.get("id")),
        )
        saved["coins_earned"] = ADD_JOB_REWARD_XP
        saved["coin_balance"] = new_balance
    except Exception as exc:  # noqa: BLE001 — reward is best-effort, save already committed
        _log.warning("add_job reward failed for user=%s id=%s: %s", principal.id, saved.get("id"), exc)

    return ApplicationResponse(**saved)


@router.patch("/applications/{job_id}/imported-details", response_model=JobImportedDetailsResponse)
def update_imported_job_details(
    job_id: str,
    body: JobImportedDetailsUpdate,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobImportedDetailsResponse:
    """Fix a mis-parsed role/company on an imported job (the extractor sometimes
    reads a page tagline as the role). Only extension imports are editable —
    scraped ``jobs`` rows are scraper-owned and shared."""
    if not job_id.startswith("ext_"):
        raise HTTPException(status_code=422, detail="Only imported jobs can be edited here.")
    title = body.title.strip() if body.title is not None else None
    company = body.company.strip() if body.company is not None else None
    if title is None and company is None:
        raise HTTPException(status_code=422, detail="Nothing to update.")
    if title is not None and not is_valid_role(title):
        raise HTTPException(status_code=422, detail="That role title looks invalid.")
    if company is not None and not is_valid_company(company):
        raise HTTPException(status_code=422, detail="That company name looks invalid.")

    updated = repo.update_imported_job_details(principal.id, job_id, title=title, company=company)
    if updated is None:
        raise HTTPException(status_code=404, detail="Imported job not found.")
    return JobImportedDetailsResponse(
        job_id=job_id, job_title=updated["job_title"], company=updated.get("company_name")
    )


@router.put("/applications/{job_id}", response_model=ApplicationResponse)
def update_application(
    job_id: str,
    body: ApplicationStatusUpdate,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    if body.status not in APPLICATION_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status: {body.status}")

    now = datetime.now(timezone.utc).isoformat()
    user_id = principal.id
    existing = repo.get_application_with_job(user_id, job_id) or {}
    prior_status = existing.get("status")

    updates: dict = {"status": body.status}
    if body.notes is not None:
        updates["notes"] = body.notes
    if body.company_response is not None:
        updates["company_response"] = body.company_response
    if body.status == "applied":
        updates["applied_at"] = now
    if body.status in {"interviewing", "rejected", "offer"}:
        updates["response_at"] = now
    if body.status == "offer":
        updates["offer_received_at"] = now
    if body.status in {"ghosted", "rejected"}:
        updates["closed_at"] = now
    if body.followed_up:
        updates["followed_up_at"] = now

    # Q7: bump the stale-clock signal whenever status actually changes.
    # Notes/followed_up edits do NOT reset the clock so they can't mask company silence.
    if body.status != prior_status:
        updates["last_stage_changed_at"] = now

    # Q6: first-ever offer per user — set first_offer_at once on the user profile.
    is_first_offer = False
    if body.status == "offer" and prior_status != "offer":
        is_first_offer = repo.mark_first_offer_if_unset(user_id, now)

    repo.upsert_application(user_id, job_id, updates)
    data = repo.get_application_with_job(user_id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found.")
    response = to_application(data)
    response.is_first_offer = is_first_offer
    return response


@router.post("/save/{job_id}", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
def save_discovered_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    user_id = principal.id
    repo.upsert_application(user_id, job_id, {"status": "saved", "source": "user_discovery"})
    data = repo.get_application_with_job(user_id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return to_application(data)


@router.put("/applications/{job_id}/priority", response_model=ApplicationResponse)
def set_application_priority(
    job_id: str,
    body: ApplicationPriorityUpdate,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ApplicationResponse:
    """Persist the heart as deliberate apply/preparation intent.

    Hearting an unseen role creates the same saved intent as the canonical save
    route. Removing the heart only clears priority; it never silently removes a
    job the user already collected.
    """
    existing = repo.get_application_with_job(principal.id, job_id)
    if not existing and not body.prioritized:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved role not found.")

    updates: dict[str, object] = {
        "is_priority": body.prioritized,
        "priority_marked_at": datetime.now(timezone.utc).isoformat() if body.prioritized else None,
    }
    if not existing:
        updates.update({"status": "saved", "source": "user_discovery"})
    repo.upsert_application(principal.id, job_id, updates)

    data = repo.get_application_with_job(principal.id, job_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return to_application(data)


@router.delete("/tracker/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_tracker_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    if not repo.dismiss_saved_job(principal.id, job_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only saved jobs can be removed from Collections.",
        )


@router.post("/tracker/{job_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
def restore_tracker_job(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> None:
    if not repo.restore_saved_job(principal.id, job_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This saved-job dismissal can no longer be undone.",
        )
