from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from fastapi.responses import JSONResponse

from app.deps import Principal, get_principal
from app.repositories.job_intelligence import (
    JobIntelligenceRepository,
    get_job_intelligence_repository,
)
from app.schemas.jobs import (
    FeedStateResponse,
    JobFeedbackRequest,
    JobFeedbackResponse,
)
from app.services.job_intelligence import (
    FeedbackCommand,
    FeedbackRateLimitError,
    InvalidJobFeedbackError,
    JobIntelligence,
)

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


@router.post(
    "/feedback",
    response_model=JobFeedbackResponse,
    responses={status.HTTP_429_TOO_MANY_REQUESTS: {"description": "Daily cap"}},
)
def record_job_feedback(
    body: JobFeedbackRequest,
    principal: Principal = Depends(get_principal),
    intelligence: JobIntelligence = Depends(get_job_intelligence),
) -> JobFeedbackResponse | JSONResponse:
    command = FeedbackCommand(
        client_event_id=body.client_event_id,
        job_id=body.job_id,
        feedback_kind=body.feedback_kind,
        reason_code=body.reason_code,
        surface=body.surface,
    )
    try:
        receipt = intelligence.record_feedback(principal.id, command)
    except InvalidJobFeedbackError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except FeedbackRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily quality-report limit reached",
        ) from exc

    response = JobFeedbackResponse(**receipt.__dict__)
    return JSONResponse(
        status_code=(
            status.HTTP_201_CREATED
            if receipt.created
            else status.HTTP_200_OK
        ),
        content=response.model_dump(mode="json"),
    )
