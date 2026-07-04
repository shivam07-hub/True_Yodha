"""Reach Intelligence router — "who to reach out to" for a job.

The free tier (ADR-0018 L2): given a job's title/description/company, return
the roles to search for + search URLs the user opens in their OWN browser.
Stateless, no persist, no LLM, no coin charge. Myro constructs queries; it
never fetches or stores the results. The paid 50-coin outreach pack (drafted
message + timing + warm intros) is a separate endpoint (v1 build slice 4).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.deps import Principal, get_principal
from app.services.reach_intel import ReachSearch, build_reach_intel

router = APIRouter()


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
