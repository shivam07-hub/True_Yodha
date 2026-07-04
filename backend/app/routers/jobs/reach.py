"""Reach Intelligence router — "who to reach out to" for a job.

The free tier (ADR-0018 L2): given a job's title/description/company, return
the roles to search for + search URLs the user opens in their OWN browser.
Stateless, no persist, no LLM, no coin charge. Myro constructs queries; it
never fetches or stores the results. The paid 50-coin outreach pack (drafted
message + timing + warm intros) is a separate endpoint (v1 build slice 4).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.repositories.cv import CVVersionsRepository, get_token_cv_repository
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.services import reach_pack as reach_pack_service
from app.services import xp_policy, xp_service
from app.services.llm_provider import LLMProvider, get_llm_provider
from app.services.reach_intel import ReachSearch, build_reach_intel

router = APIRouter()

_PACK_PROMPT_KEY = "reach_pack"


class ReachSearchRequest(BaseModel):
    job_title: str = Field(default="", max_length=300)
    company: str | None = Field(default=None, max_length=200)
    job_description: str = Field(default="", max_length=20_000)


class ReachSearchModel(BaseModel):
    label: str
    url: str
    kind: str


class ReachSearchResponse(BaseModel):
    reporting_target: str | None
    function: str
    target_titles: list[str]
    primary: ReachSearchModel | None
    alternates: list[ReachSearchModel]


def _to_model(search: ReachSearch | None) -> ReachSearchModel | None:
    if search is None:
        return None
    return ReachSearchModel(label=search.label, url=search.url, kind=search.kind)


@router.post("/reach/search", response_model=ReachSearchResponse)
def reach_search(
    body: ReachSearchRequest,
    _principal: Principal = Depends(get_principal),
) -> ReachSearchResponse:
    """Free, deterministic reach searches for a job. Auth-gated (ties the
    action to a connected account) but not coin-gated."""
    intel = build_reach_intel(
        job_title=body.job_title,
        job_description=body.job_description,
        company=body.company,
    )
    return ReachSearchResponse(
        reporting_target=intel.reporting_target,
        function=intel.function,
        target_titles=intel.target_titles,
        primary=_to_model(intel.primary),
        alternates=[_to_model(s) for s in intel.alternates if s is not None],
    )


# ── Paid outreach pack (50 coins, ADR-0018 Path 2) ────────────────────────────


class ReachPack(BaseModel):
    outreach_message: str
    referral_ask: str
    timing: str
    warm_intro: str


class ReachPackResponse(BaseModel):
    purchased: bool
    pack: ReachPack | None
    cost: int = xp_policy.REACH_PACK_XP_COST
    new_coin_balance: int | None = None


def _cached_pack(repo: JobsRepository, user_id: str, job_id: str) -> ReachPack | None:
    raw = repo.get_deepening(user_id, job_id, _PACK_PROMPT_KEY)
    if not raw:
        return None
    try:
        return ReachPack(**json.loads(raw))
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


@router.get("/{job_id}/reach/pack", response_model=ReachPackResponse)
def get_reach_pack(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ReachPackResponse:
    """Replay a purchased pack for free. UI reads this to show 'view' vs
    'get · 50 coins' without charging."""
    cached = _cached_pack(repo, principal.id, job_id)
    return ReachPackResponse(purchased=cached is not None, pack=cached)


@router.post("/{job_id}/reach/pack", response_model=ReachPackResponse)
async def create_reach_pack(
    job_id: str,
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
    cv_repo: CVVersionsRepository = Depends(get_token_cv_repository),
    provider: LLMProvider = Depends(get_llm_provider),
) -> ReachPackResponse:
    """Generate the full outreach pack for a job. 50 coins, charged on success
    only; a purchased pack replays free (idempotent per user+job)."""
    user_id = principal.id

    cached = _cached_pack(repo, user_id, job_id)
    if cached is not None:
        balance = await xp_service.get_xp_balance(user_id)
        return ReachPackResponse(purchased=True, pack=cached, new_coin_balance=balance)

    jobs_meta = repo.get_jobs_by_ids([job_id])
    if not jobs_meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    meta = jobs_meta[0]
    role = meta.get("job_title") or ""
    company = meta.get("company_name") or ""
    description = meta.get("job_description") or ""

    # Preflight funding so we never spend an LLM call the user can't pay for.
    await xp_service.assert_can_spend_xp(user_id, xp_policy.REACH_PACK_XP_COST, "reach_pack")

    intel = build_reach_intel(job_title=role, job_description=description, company=company)
    baseline = cv_repo.latest_baseline(user_id) or {}

    pack = await reach_pack_service.build_reach_pack(
        cv_structured=baseline.get("cv_structured") or {},
        body_text=baseline.get("body_text") or "",
        role=role,
        company=company,
        target_titles=intel.target_titles,
        warm_connection=None,  # slice 5 wires own-connections warm intros here
        provider=provider,
    )
    if pack is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not build the reach pack right now. Try again shortly.",
        )

    try:
        new_balance = await xp_service.charge_or_raise(
            user_id,
            xp_policy.REACH_PACK_XP_COST,
            "reach_pack",
            floor=xp_policy.REACH_PACK_XP_FLOOR,
            ref_table="job_deepenings",
            ref_id=f"{job_id}:{_PACK_PROMPT_KEY}",
        )
    except xp_service.InsufficientXPError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"{exc} Earn coins by practising a skill, or unlock this later.",
        ) from exc

    repo.upsert_deepening(user_id, job_id, _PACK_PROMPT_KEY, json.dumps(pack))
    return ReachPackResponse(
        purchased=True,
        pack=ReachPack(**pack),
        new_coin_balance=new_balance,
    )
