"""Request and inspect durable Tier-0 snapshot refreshes."""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Header, status

from app.schemas.jobs import (
    SnapshotRefreshAcceptedResponse,
    SnapshotRefreshStatusResponse,
)
from app.security.refresh_secret import require_refresh_secret
from app.services.snapshot_refresh import build_snapshot_refresh_service

router = APIRouter()


@router.post(
    "/analytics/refresh-snapshot",
    response_model=SnapshotRefreshAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_snapshot_refresh(
    background_tasks: BackgroundTasks,
    x_myro_refresh_secret: Annotated[str, Header(min_length=10)],
    force: bool = False,
) -> SnapshotRefreshAcceptedResponse:
    """Persist refresh intent, acknowledge it, then run J3 work off-response.

    ``force=true`` is the scraper finalisation event. The default is the cron
    repair lane: it only requests tasks whose last success is overdue or failed.
    """
    require_refresh_secret(x_myro_refresh_secret)
    trigger = "batch-finalize" if force else "cron"
    service = build_snapshot_refresh_service()
    tasks = service.request(trigger=trigger, force=force)
    if tasks:
        background_tasks.add_task(
            service.process,
            tasks,
            trigger=trigger,
            force=force,
        )
    return SnapshotRefreshAcceptedResponse(tasks=tasks)


@router.get(
    "/analytics/refresh-status",
    response_model=SnapshotRefreshStatusResponse,
)
def snapshot_refresh_status(
    x_myro_refresh_secret: Annotated[str, Header(min_length=10)],
) -> SnapshotRefreshStatusResponse:
    """Operational truth: last success/error and staleness for each product."""
    require_refresh_secret(x_myro_refresh_secret)
    return SnapshotRefreshStatusResponse(
        tasks=build_snapshot_refresh_service().status()
    )
