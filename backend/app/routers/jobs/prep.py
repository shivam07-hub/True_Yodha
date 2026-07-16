"""Preparations room — the paid day-of brief for one application.

Grill locks 2026-07-15 (memory: project_preparations_surface): the prep room's
one paid artifact. 30 coins, charged on success only, replays free — the exact
reach-pack contract (job_deepenings cache keyed per user+job).

The brief grounds on the SAME coverage panel the room shows (cached
jd_coverage; computed inline on a cache miss so the brief never renders from
nothing) — JD + the user's own stories, never invented company facts.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.security import redact_sensitive_text
from app.services import jd_coverage, prep_brief as prep_brief_service, xp_policy, xp_service
from app.services.llm_provider import LLMProvider, get_judgment_provider, get_llm_provider

router = APIRouter()

_BRIEF_PROMPT_KEY = "prep_brief"


class BriefLead(BaseModel):
    story: str
    why: str = ""


class PrepBrief(BaseModel):
    snapshot: str
    leads: list[BriefLead]
    likely_questions: list[str]
    watch_out: str = ""
    plan: list[str]


class PrepBriefResponse(BaseModel):
    purchased: bool
    brief: PrepBrief | None
    cost: int = xp_policy.PREP_BRIEF_XP_COST
    new_coin_balance: int | None = None


def _cached_brief(repo: JobsRepository, user_id: str, job_id: str) -> PrepBrief | None:
    raw = repo.get_deepening(user_id, job_id, _BRIEF_PROMPT_KEY)
    if not raw:
        return None
    try:
        return PrepBrief(**json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


@router.get("/{job_id}/prep/brief", response_model=PrepBriefResponse)
def get_prep_brief(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> PrepBriefResponse:
    """Replay a purchased brief for free. The room reads this to show
    'view brief' vs 'get · 30 coins' without charging."""
    cached = _cached_brief(repo, principal.id, job_id)
    return PrepBriefResponse(purchased=cached is not None, brief=cached)


@router.post("/{job_id}/prep/brief", response_model=PrepBriefResponse)
async def create_prep_brief(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    provider: LLMProvider = Depends(get_llm_provider),
) -> PrepBriefResponse:
    """Generate the day-of brief. 30 coins, charged on success only; a
    purchased brief replays free (idempotent per user+job)."""
    user_id = principal.id

    cached = _cached_brief(repo, user_id, job_id)
    if cached is not None:
        balance = await xp_service.get_xp_balance(user_id)
        return PrepBriefResponse(purchased=True, brief=cached, new_coin_balance=balance)

    jobs_meta = repo.get_jobs_by_ids([job_id])
    if not jobs_meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    meta = jobs_meta[0]
    role = meta.get("job_title") or ""
    company = meta.get("company_name") or ""
    jd_text = meta.get("job_description") or ""

    # Preflight funding so we never spend an LLM call the user can't pay for.
    await xp_service.assert_can_spend_xp(user_id, xp_policy.PREP_BRIEF_XP_COST, "prep_brief")

    # Ground on the room's own coverage panel — cached, else computed inline
    # (and cached for the room) so the brief and the panel can never disagree.
    hit = jd_coverage.payload_to_result(
        repo.get_deepening(user_id, job_id, jd_coverage.CACHE_PROMPT_KEY)
    )
    if hit is not None:
        coverage_rows = hit[0].requirements
    else:
        result = await jd_coverage.assess(user_id, jd_text, get_judgment_provider())
        if result.requirements:
            repo.upsert_deepening(
                user_id, job_id, jd_coverage.CACHE_PROMPT_KEY,
                jd_coverage.result_to_payload(result),
            )
        coverage_rows = result.requirements

    brief = await prep_brief_service.build_prep_brief(
        role=role,
        company=company,
        jd_text=jd_text,
        coverage_rows=coverage_rows,
        provider=provider,
    )
    if brief is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not build the brief right now. Try again shortly.",
        )

    try:
        new_balance = await xp_service.charge_or_raise(
            user_id,
            xp_policy.PREP_BRIEF_XP_COST,
            "prep_brief",
            floor=xp_policy.PREP_BRIEF_XP_FLOOR,
            ref_table="job_deepenings",
            ref_id=f"{job_id}:{_BRIEF_PROMPT_KEY}",
        )
    except xp_service.InsufficientXPError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"{redact_sensitive_text(exc)} Earn coins by practising a skill, or unlock this later.",
        ) from exc

    repo.upsert_deepening(user_id, job_id, _BRIEF_PROMPT_KEY, json.dumps(brief))
    return PrepBriefResponse(
        purchased=True,
        brief=PrepBrief(**brief),
        new_coin_balance=new_balance,
    )
