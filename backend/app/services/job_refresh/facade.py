"""Public facade for the Job Refresh seam. See CONTEXT.md "Job Refresh"."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException, status

from app.repositories.jobs import JobsRepository
from app.services import new_inventory
from app.services.job_refresh import _dispatch, _xp_charge
from app.services.job_refresh.types import SEARCH_UNAVAILABLE, RefreshState, RefreshTicket
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
        """Kick off compute and return a ticket. Raises 400 on insufficient coins.

        Pricing follows who created the reason to run (Shivam, 2026-07-28 — value
        first, monetise at the right point in the journey):

        - **Myro-initiated → free.** We ingested jobs this user has never been
          matched against and told them so. Billing them to look at inventory they
          didn't ask for taxes the exact pull we want, and at 100 coins it prices
          out the newest users hardest.
        - **User-initiated → flat `MATCH_RUN_COST`.** No new inventory, they just
          want another pass. That is a genuine ask for compute.

        Server decides — `count_new_jobs_for_user` — because a client-supplied
        "free" flag is a free-refresh exploit. Fairness backstop stays at
        `_dispatch`: a run producing nothing chargeable is refunded anyway.

        An UNKNOWN count waives (`new_inventory.waives_charge`). The query
        read-timed-out four times in one hour of prod logs on 2026-08-21 and
        the old code read that as zero, which is the value that charges.

        If Redis is configured and no Job Runner is alive, refuse before the
        debit — a search that cannot start must not touch the wallet.
        """
        if _dispatch.cannot_run():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=SEARCH_UNAVAILABLE,
            )
        excluded_job_ids = repo.get_existing_match_job_ids(user_id)
        price = 0 if new_inventory.waives_charge(new_inventory.count_for_user(repo, user_id)) else MATCH_RUN_COST
        new_balance = await _xp_charge.charge(user_id, price) if price else None
        return await _dispatch.dispatch(
            user_id=user_id,
            batch_week=batch_week,
            excluded_job_ids=excluded_job_ids,
            xp_charged=price,
            new_coin_balance=new_balance,
        )

    @staticmethod
    async def abandon_stranded(user_id: str, ticket_id: str, queued_for: float) -> RefreshState | None:
        """Fail a queued ticket whose Job Runner disappeared. None = keep waiting."""
        return await _dispatch.abandon_stranded(user_id, ticket_id, queued_for)

    @staticmethod
    async def status_or_none(user_id: str, ticket_id: str) -> RefreshState | None:
        """`status` without the 404. For callers asking "is this run still
        live?" — an expired ticket is an answer there, not an error, and
        raising one to catch it makes absence look like a failure."""
        return _dispatch.read_state(user_id, ticket_id)

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
