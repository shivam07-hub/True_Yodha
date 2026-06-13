from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, status

from app.deps import Principal, get_principal
from app.repositories.job_intelligence import (
    JobIntelligenceRepository,
    get_job_intelligence_repository,
)
from app.schemas.jobs import FeedStateResponse
from app.services.job_intelligence import JobIntelligence

router = APIRouter()


def get_job_intelligence(
    repository: JobIntelligenceRepository = Depends(
        get_job_intelligence_repository
    ),
) -> JobIntelligence:
    return JobIntelligence(repository)


@router.get(
    "/feed-state",
    response_model=FeedStateResponse,
    responses={status.HTTP_304_NOT_MODIFIED: {"description": "Feed unchanged"}},
)
def get_feed_state(
    response: Response,
    _principal: Principal = Depends(get_principal),
    intelligence: JobIntelligence = Depends(get_job_intelligence),
    if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
) -> FeedStateResponse | Response:
    read = intelligence.feed_state(if_none_match=if_none_match)
    headers = {
        "ETag": read.etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
    }
    if read.not_modified:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    response.headers.update(headers)
    return FeedStateResponse(
        feed_version=read.state.feed_version,
        published_at=read.state.published_at,
        imported_job_count=read.state.imported_job_count,
        latest_batch_date=read.state.latest_batch_date,
    )
