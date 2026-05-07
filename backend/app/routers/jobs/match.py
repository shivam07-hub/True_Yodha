import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.deps import get_current_user
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    ComputeJobMatchesResponse,
    JobComputeStatusResponse,
    JobMatchesResponse,
    UserSkillDemandResponse,
)
from app.services import job_match_compute_async, jobs_workflow

from ._shared import last_monday, to_job_match

router = APIRouter()


@router.get("/my-skills/demand", response_model=UserSkillDemandResponse)
async def get_my_skill_demand(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> UserSkillDemandResponse:
    items = jobs_workflow.build_user_skill_demand(repo, current_user["user_id"])
    return UserSkillDemandResponse(skills=items, total=len(items))


@router.get("/matches", response_model=JobMatchesResponse)
async def get_job_matches(
    current_user: dict = Depends(get_current_user),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobMatchesResponse:
    from datetime import datetime, timezone
    batch_week = last_monday()
    rows = repo.get_user_matches_for_week(current_user["user_id"], batch_week)
    jobs = [to_job_match(row, batch_week) for row in rows]

    feed_ts_raw = repo.get_feed_updated_at()
    feed_updated_at = datetime.fromisoformat(feed_ts_raw) if feed_ts_raw else None

    raw_computed = rows[0].get("computed_at") if rows else None
    matches_computed_at: datetime | None = None
    if raw_computed:
        try:
            matches_computed_at = datetime.fromisoformat(raw_computed)
            if matches_computed_at.tzinfo is None:
                matches_computed_at = matches_computed_at.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            pass

    return JobMatchesResponse(
        jobs=jobs,
        batch_week=batch_week,
        total=len(jobs),
        feed_updated_at=feed_updated_at,
        matches_computed_at=matches_computed_at,
    )


@router.post("/compute", response_model=ComputeJobMatchesResponse, status_code=status.HTTP_202_ACCEPTED)
async def compute_job_matches(
    current_user: dict = Depends(get_current_user),
) -> ComputeJobMatchesResponse:
    user_id = current_user["user_id"]
    batch_week = last_monday()
    try:
        queued = job_match_compute_async.enqueue_compute_job(user_id, batch_week)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return ComputeJobMatchesResponse(
        matches_written=int(queued.get("matches_written") or 0),
        from_cache=bool(queued.get("from_cache") or False),
        batch_week=batch_week,
        needs_onboarding=bool(queued.get("needs_onboarding") or False),
        debug=queued.get("debug"),
        status=str(queued.get("status") or "queued"),  # type: ignore[arg-type]
        already_running=bool(queued.get("already_running") or False),
        job_id=queued.get("job_id"),
        message=queued.get("message"),
    )


@router.get("/compute/status", response_model=JobComputeStatusResponse)
async def get_compute_status(
    current_user: dict = Depends(get_current_user),
) -> JobComputeStatusResponse:
    batch_week = last_monday()
    try:
        status_payload = job_match_compute_async.get_status(current_user["user_id"], batch_week)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return JobComputeStatusResponse(**status_payload)


def _status_event_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, default=str)


@router.get("/compute/status/stream")
async def stream_compute_status(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    user_id = current_user["user_id"]
    batch_week = last_monday()

    async def _events() -> Any:
        previous = ""
        yield "retry: 2000\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                payload = job_match_compute_async.get_status(user_id, batch_week)
            except RuntimeError as exc:
                error_payload = {
                    "user_id": user_id,
                    "batch_week": str(batch_week),
                    "status": "failed",
                    "message": "Status stream unavailable.",
                    "error": str(exc),
                }
                yield f"event: status\ndata: {_status_event_payload(error_payload)}\n\n"
                break

            encoded = _status_event_payload(payload)
            if encoded != previous:
                yield f"event: status\ndata: {encoded}\n\n"
                previous = encoded
                if payload.get("status") in job_match_compute_async.TERMINAL_STATUSES:
                    break

            # comment ping keeps proxies from buffering/closing idle streams
            yield ": keep-alive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        _events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
