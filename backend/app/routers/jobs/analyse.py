import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import text_stream, xp_service
from app.services.llm_provider import (
    LLMProvider,
    get_blocking_judgment_provider,
)
from app.routers.jobs._shared import last_monday

router = APIRouter()

ANALYSE_XP_COST = 10

# Upper bound on one fit-batch request. The /intel drill only ever shows a
# single company's open roles (~6–20); the cap stops a crafted request from
# scanning the whole job table through this free, no-charge endpoint.
FIT_BATCH_MAX = 50

_SYSTEM_PROMPT = (
    "You are a senior career advisor. Given a candidate's skill profile and a job posting, "
    "write 2–3 sentences: why this job fits this candidate, and what skill areas to focus on to improve the match. "
    "Be specific to the candidate's actual skills. Plain text only."
)


def _build_prompt(user_skill_map: dict[str, int], title: str, company: str | None,
                  overlap_score: float, matched_skills: list[str], description: str) -> str:
    top_skills = dict(sorted(user_skill_map.items(), key=lambda x: -x[1])[:20])
    return f"""Candidate skills (taxonomy_key: level 0–5):
{json.dumps(top_skills, indent=2)}

Job: {title} at {company or "Unknown"}
Overlap score: {overlap_score}%
Matched skills: {matched_skills}
Description snippet: {description[:600]}"""


def _compute_overlap(skill_rows: list[dict], user_lower: dict[str, int]) -> tuple[float, list[str]]:
    main_keys = [
        ((r.get("skills") or {}).get("taxonomy_key") or "").lower()
        for r in skill_rows if r.get("is_primary")
    ]
    side_keys = [
        ((r.get("skills") or {}).get("taxonomy_key") or "").lower()
        for r in skill_rows if not r.get("is_primary")
    ]
    main_keys = [k for k in main_keys if k]
    side_keys = [k for k in side_keys if k]

    main_hits = [k for k in main_keys if k in user_lower]
    side_hits = [k for k in side_keys if k in user_lower]

    max_possible = 2.0 * len(main_keys) + 1.0 * len(side_keys)
    score = round((2.0 * len(main_hits) + 1.0 * len(side_hits)) / max_possible * 100, 1) if max_possible else 0.0
    matched = list({k for k in main_hits + side_hits})
    return score, matched


class FitBatchRequest(BaseModel):
    job_ids: list[str] = Field(default_factory=list)


class FitItem(BaseModel):
    job_id: str
    overlap_score: float
    matched_skills: list[str]
    matched_count: int
    total_skills: int


class FitBatchResponse(BaseModel):
    fits: list[FitItem]


@router.post("/fit-batch", response_model=FitBatchResponse)
async def fit_batch(
    body: FitBatchRequest,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> FitBatchResponse:
    """Deterministic fit % for a set of jobs against the caller's CV skills.

    Powers the logged-in /intel drill — the SAME `_compute_overlap` the analyse
    path uses, so the number here matches the dashboard. No LLM, no charge, no
    persist: pure read + arithmetic. Jobs absent from job_skills (no taxonomy
    rows) are omitted from the response rather than reported as 0% — a missing
    skill map is "unknown fit", not "no fit".
    """
    job_ids = list(dict.fromkeys(body.job_ids))  # de-dup, preserve order
    if not job_ids:
        return FitBatchResponse(fits=[])
    if len(job_ids) > FIT_BATCH_MAX:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Too many job_ids; max {FIT_BATCH_MAX} per request.",
        )

    skill_rows = repo.get_all_job_skill_rows(job_ids=job_ids)
    rows_by_job: dict[str, list[dict]] = {}
    for row in skill_rows:
        jid = row.get("job_id")
        if jid:
            rows_by_job.setdefault(str(jid), []).append(row)

    user_skill_map = repo.get_user_skill_map(principal.id)
    user_lower = {k.lower(): v for k, v in user_skill_map.items()}

    fits: list[FitItem] = []
    for jid in job_ids:
        rows = rows_by_job.get(jid)
        if not rows:
            continue
        score, matched = _compute_overlap(rows, user_lower)
        total_skills = sum(1 for r in rows if (r.get("skills") or {}).get("taxonomy_key"))
        fits.append(FitItem(
            job_id=jid,
            overlap_score=score,
            matched_skills=matched,
            matched_count=len(matched),
            total_skills=total_skills,
        ))
    return FitBatchResponse(fits=fits)


@router.post("/analyse/{job_id}/stream")
async def analyse_job_stream(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    llm_provider: LLMProvider = Depends(get_blocking_judgment_provider),
) -> StreamingResponse:
    """Stream the fit-rationale token-by-token (ADR-0009 PR1, direct stream).

    Blocking judgment lane: the rationale IS a verdict on whether this job is
    worth the user's time, they are watching it stream, and they are charged for
    it. It ran on `get_interactive_provider` until 2026-08-04, whose lead tier is
    `google/gemma-3-4b-it` — a model this codebase's own tier table excludes from
    every ranking path.

    Charge-on-success: 10 XP is charged only after the full stream lands and
    the explanation persists — a provider failure (pre- or mid-stream) charges
    nothing. Idempotent: a previously-analysed job replays its cached text with
    no re-charge and no LLM call.
    """
    user_id = principal.id
    batch_week = last_monday()

    skill_rows = repo.get_all_job_skill_rows(job_ids=[job_id])
    if not skill_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found or has no skills")
    jobs_meta = repo.get_jobs_by_ids([job_id])
    if not jobs_meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    meta = jobs_meta[0]

    # Idempotency — already analysed this week → replay cached text, no charge.
    cached = repo.get_match_explanation(user_id, job_id, batch_week)
    if cached:
        balance = await xp_service.get_xp_balance(user_id)
        return text_stream.response(
            text_stream.replay(cached, done={"new_coin_balance": balance, "cached": True})
        )

    # Funding preflight (no mutation). Frontend gates broke users, but defend the
    # LLM call here too — never spend a provider slot we can't charge for.
    await xp_service.assert_can_spend_xp(user_id, ANALYSE_XP_COST, "analyse_job")

    user_skill_map = repo.get_user_skill_map(user_id)
    user_lower = {k.lower(): v for k, v in user_skill_map.items()}
    overlap_score, matched_skills = _compute_overlap(skill_rows, user_lower)
    prompt = _build_prompt(
        user_skill_map,
        title=meta.get("job_title", ""),
        company=meta.get("company_name"),
        overlap_score=overlap_score,
        matched_skills=matched_skills,
        description=meta.get("job_description") or "",
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    async def finalize(text: str) -> dict:
        # Charge-on-success: atomic charge + persist only after a complete stream.
        try:
            new_balance = await xp_service.charge_or_raise(
                user_id, ANALYSE_XP_COST, "analyse_job",
                ref_table="user_job_matches", ref_id=f"{job_id}:{batch_week}",
            )
        except xp_service.InsufficientXPError as exc:
            raise text_stream.StreamAbort("Out of tokens.", recoverable=False) from exc

        repo.upsert_job_match(user_id, job_id, {
            "batch_week": str(batch_week),
            "overlap_score": overlap_score,
            "matched_skills": matched_skills,
            "llm_explanation": text,
            "llm_rank": None,
            "computed_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"new_coin_balance": new_balance}

    return text_stream.response(
        text_stream.live(llm_provider, messages, max_tokens=300, finalize=finalize)
    )
