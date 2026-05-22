import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    ComputeJobMatchesResponse,
    JobComputeStatusResponse,
    JobMatchesResponse,
    UserSkillDemandResponse,
)
from app.services import job_match_compute_async, jobs_workflow, xp_service
from app.services.xp_policy import MATCH_REFRESH_XP_COST

from ._shared import last_monday, to_job_match

router = APIRouter()

REFRESH_XP_COST = MATCH_REFRESH_XP_COST


@router.get("/my-skills/demand", response_model=UserSkillDemandResponse)
async def get_my_skill_demand(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> UserSkillDemandResponse:
    items = jobs_workflow.build_user_skill_demand(repo, principal.id)
    return UserSkillDemandResponse(skills=items, total=len(items))


@router.get("/matches", response_model=JobMatchesResponse)
async def get_job_matches(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> JobMatchesResponse:
    from datetime import datetime, timezone
    batch_week = last_monday()
    rows = repo.get_user_matches_for_week(principal.id, batch_week)
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


def _build_response(result: dict[str, Any], new_xp_balance: int | None = None) -> ComputeJobMatchesResponse:
    batch_week = result.get("batch_week") or last_monday()
    return ComputeJobMatchesResponse(
        matches_written=int(result.get("matches_written") or 0),
        from_cache=False,
        exhausted=bool(result.get("exhausted") or False),
        batch_week=batch_week,
        needs_onboarding=bool(result.get("needs_onboarding") or False),
        debug=result.get("debug"),
        status=str(result.get("status") or "succeeded"),  # type: ignore[arg-type]
        already_running=bool(result.get("already_running") or False),
        job_id=result.get("job_id"),
        message=result.get("message"),
        new_xp_balance=new_xp_balance,
        xp_spent=int(result.get("xp_spent") or 0),
    )


@router.post("/compute", response_model=ComputeJobMatchesResponse, status_code=status.HTTP_202_ACCEPTED)
async def compute_job_matches_async(
    principal: Principal = Depends(get_principal),
) -> ComputeJobMatchesResponse:
    user_id = principal.id
    batch_week = last_monday()
    try:
        queued = job_match_compute_async.enqueue_compute_job(user_id, batch_week)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return _build_response(queued)


@router.get("/compute/status", response_model=JobComputeStatusResponse)
async def get_compute_status(
    principal: Principal = Depends(get_principal),
) -> JobComputeStatusResponse:
    batch_week = last_monday()
    try:
        status_payload = job_match_compute_async.get_status(principal.id, batch_week)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return JobComputeStatusResponse(**status_payload)


@router.post("/refresh", response_model=ComputeJobMatchesResponse, status_code=status.HTTP_202_ACCEPTED)
async def refresh_job_matches(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> ComputeJobMatchesResponse:
    user_id = principal.id
    batch_week = last_monday()

    excluded_job_ids = repo.get_existing_match_job_ids(user_id, batch_week)
    await xp_service.assert_can_spend_xp(user_id, REFRESH_XP_COST, "refresh_matches")

    if not settings.redis_url.strip():
        result = await job_match_compute_async.compute_job_matches_inline(
            user_id, batch_week, excluded_job_ids=excluded_job_ids
        )
        new_balance = None
        if result.get("matches_written", 0) > 0:
            try:
                new_balance = await xp_service.spend_xp(user_id, REFRESH_XP_COST, "refresh_matches")
                result["xp_spent"] = REFRESH_XP_COST
            except HTTPException:
                raise
        return _build_response(result, new_xp_balance=new_balance)

    try:
        queued = job_match_compute_async.enqueue_compute_job(
            user_id,
            batch_week,
            excluded_job_ids=excluded_job_ids,
            charge_xp_amount=REFRESH_XP_COST,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return _build_response(queued)


@router.get("/refresh/status", response_model=JobComputeStatusResponse)
async def get_refresh_status(
    principal: Principal = Depends(get_principal),
) -> JobComputeStatusResponse:
    batch_week = last_monday()
    try:
        status_payload = job_match_compute_async.get_status(principal.id, batch_week)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return JobComputeStatusResponse(**status_payload)


def _status_event_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, default=str)


@router.get("/refresh/status/stream")
async def stream_refresh_status(
    request: Request,
    principal: Principal = Depends(get_principal),
) -> StreamingResponse:
    user_id = principal.id
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
