"""Public facade for the Job Refresh seam. See CONTEXT.md "Job Refresh"."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status

from app.repositories.jobs import JobsRepository
from app.services.job_refresh import _dispatch, _xp_charge
from app.services.job_refresh.types import RefreshState, RefreshTicket
from app.services.xp_policy import MATCH_REFRESH_XP_COST


class JobRefresh:
    """Job Refresh seam — every refresh surface (web, mobile, future scheduler)
    starts and polls through these two methods. No cooldown.
    """

    @staticmethod
    async def start(
        user_id: str,
        repo: JobsRepository,
        batch_week: date,
    ) -> RefreshTicket:
        """Charge XP, kick off compute, return ticket. Raises 400 on insufficient XP."""
        excluded_job_ids = repo.get_existing_match_job_ids(user_id, batch_week)
        new_balance = await _xp_charge.charge(user_id, MATCH_REFRESH_XP_COST)
        return await _dispatch.dispatch(
            user_id=user_id,
            batch_week=batch_week,
            excluded_job_ids=excluded_job_ids,
            xp_charged=MATCH_REFRESH_XP_COST,
            new_xp_balance=new_balance,
        )

    @staticmethod
    async def status(user_id: str, ticket_id: str) -> RefreshState:
        """Read the latest state for the given ticket. 404 if unknown."""
        state = _dispatch.read_state(user_id, ticket_id)
        if state is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Refresh ticket not found or expired.",
            )
        return state
