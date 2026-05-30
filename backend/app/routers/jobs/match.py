import asyncio
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.deps import Principal, get_principal
from app.repositories.jobs import JobsRepository, get_token_jobs_repository
from app.schemas import (
    JobMatchesResponse,
    RefreshStateResponse,
    RefreshTicketResponse,
    UserSkillDemandResponse,
)
from app.services import jobs_workflow, progress_stream
from app.services.job_refresh import JobRefresh

from ._shared import last_monday, to_job_match

router = APIRouter()


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


@router.post("/refresh", response_model=RefreshTicketResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_job_refresh(
    principal: Principal = Depends(get_principal),
    repo: JobsRepository = Depends(get_token_jobs_repository),
) -> RefreshTicketResponse:
    """Charge XP + kick off compute. See CONTEXT.md "Job Refresh"."""
    ticket = await JobRefresh.start(principal.id, repo, last_monday())
    return RefreshTicketResponse(
        id=ticket.id,
        state=ticket.state,
        progress_label=ticket.progress_label,
        batch_week=ticket.batch_week,
        xp_charged=ticket.xp_charged,
        new_xp_balance=ticket.new_xp_balance,
        matches_written=ticket.matches_written,
    )


@router.get("/refresh/{ticket_id}", response_model=RefreshStateResponse)
async def get_job_refresh_status(
    ticket_id: str,
    principal: Principal = Depends(get_principal),
) -> RefreshStateResponse:
    """Legacy poll endpoint. Superseded by /refresh/{ticket_id}/stream (ADR-0009
    PR2) — kept for deploy-window compatibility + as a manual fallback."""
    state = await JobRefresh.status(principal.id, ticket_id)
    return RefreshStateResponse(
        ticket_id=state.ticket_id,
        state=state.state,
        progress_label=state.progress_label,
        batch_week=state.batch_week,
        matches_written=state.matches_written,
        refund=state.refund,
        new_xp_balance=state.new_xp_balance,
        outcome_kind=state.outcome_kind,
        error=state.error,
        debug=state.debug or None,
    )


@router.get("/refresh/{ticket_id}/stream")
async def stream_job_refresh(
    ticket_id: str,
    principal: Principal = Depends(get_principal),
) -> StreamingResponse:
    """ADR-0009 PR2 — live Job Refresh progress over SSE (replaces the 1s poll).

    Snapshot-watch relay: tails the same Redis state key (prod) / in-process
    state (dev) the legacy poll read, and emits typed `phase` / `done` / `error`
    frames. Terminal frame closes the stream; a hard timeout guarantees the
    connection never hangs (the client re-reads on reconnect).
    """
    user_id = principal.id

    async def gen() -> AsyncIterator[str]:
        started = time.monotonic()
        last_label: str | None = None
        while True:
            try:
                state = await JobRefresh.status(user_id, ticket_id)
            except HTTPException:
                yield progress_stream.sse(
                    {"type": "error", "recoverable": False, "message": "Unknown refresh ticket."}
                )
                return

            life = state.state
            if life in ("queued", "computing"):
                if state.progress_label != last_label:
                    last_label = state.progress_label
                    yield progress_stream.sse(
                        {"type": "phase", "phase": life, "label": state.progress_label}
                    )
                else:
                    yield progress_stream.HEARTBEAT
            elif life == "done":
                yield progress_stream.sse({
                    "type": "done",
                    "result": {
                        "state": "done",
                        "ticket_id": state.ticket_id,
                        "progress_label": state.progress_label,
                        "matches_written": state.matches_written,
                        "outcome_kind": state.outcome_kind,
                        "refund": state.refund,
                        "new_xp_balance": state.new_xp_balance,
                    },
                })
                return
            else:  # failed
                yield progress_stream.sse({
                    "type": "error",
                    "recoverable": True,
                    "message": state.error or "Refresh failed. Please try again.",
                    "result": {
                        "state": "failed",
                        "refund": state.refund,
                        "new_xp_balance": state.new_xp_balance,
                    },
                })
                return

            if time.monotonic() - started > progress_stream.TIMEOUT_SECONDS:
                yield progress_stream.sse({
                    "type": "error",
                    "recoverable": True,
                    "message": "Refresh is taking longer than expected — try again.",
                    "result": {"state": "timeout"},
                })
                return
            await asyncio.sleep(progress_stream.TICK_SECONDS)

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=progress_stream.SSE_HEADERS
    )
