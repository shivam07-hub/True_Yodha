"""Public facade for the Job Refresh seam. See CONTEXT.md "Job Refresh"."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status

from app.repositories.jobs import JobsRepository
from app.services.job_refresh import _dispatch, _xp_charge
from app.services.job_refresh.types import RefreshState, RefreshTicket
from app.services.xp_policy import MATCH_RUN_COST


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
        """Charge the flat run price, kick off compute, return ticket. Raises 400 on
        insufficient coins.

        Standardized matcher: EVERY run costs the same flat `MATCH_RUN_COST` — no free
        tier, no vanity surcharge (reverses the old "free when new jobs" waiver, #36
        N2). The user pays to ask Myro to match. Fairness backstop stays at `_dispatch`:
        a run that produces nothing chargeable (`should_charge_xp` False — exhausted /
        cache-hit) is refunded, so the flat charge never bills a no-op.
        """
        excluded_job_ids = repo.get_existing_match_job_ids(user_id)
        new_balance = await _xp_charge.charge(user_id, MATCH_RUN_COST)
        return await _dispatch.dispatch(
            user_id=user_id,
            batch_week=batch_week,
            excluded_job_ids=excluded_job_ids,
            xp_charged=MATCH_RUN_COST,
            new_coin_balance=new_balance,
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
