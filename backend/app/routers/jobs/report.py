"""Deploy-window compatibility for the former inactive-report endpoint."""

from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, HTTPException, status

from app.deps import Principal, get_principal
from app.services.job_intelligence import (
    FeedbackCommand,
    FeedbackRateLimitError,
    JobIntelligence,
)

from .intelligence import get_job_intelligence

router = APIRouter()


@router.post("/{job_id}/report")
def report_job_inactive(
    job_id: str,
    principal: Principal = Depends(get_principal),
    intelligence: JobIntelligence = Depends(get_job_intelligence),
) -> dict[str, int | bool]:
    client_event_id = uuid5(
        NAMESPACE_URL,
        f"myro:legacy-inactive-report:{principal.id}:{job_id}",
    )
    try:
        receipt = intelligence.record_feedback(
            principal.id,
            FeedbackCommand(
                client_event_id=client_event_id,
                job_id=job_id,
                feedback_kind="quality",
                reason_code="posting_inactive",
                surface="job_detail",
            ),
        )
    except FeedbackRateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily quality-report limit reached",
        ) from exc
    pulse = intelligence.pulses([job_id])
    visible_report_count = (
        pulse[0].quality_report_count
        if pulse and pulse[0].quality_report_count is not None
        else 0
    )
    return {
        "report_count": visible_report_count,
        "already_reported": not receipt.created,
        "xp_earned": 0,
    }
