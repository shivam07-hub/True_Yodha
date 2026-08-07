"""GET /partner/v1/users/{external_id}/jobs — the pull half of job delivery.

The webhook is the push half. This exists so a partner is never stuck: they can
integrate before their endpoint is live, backfill after an outage exhausted a
delivery's retries, and reconcile what they think they received against what we
think we sent.

Reading does NOT consume. The ledger only moves when an event is pushed, so a
partner polling this endpoint sees the same openings until we actually send them.
Anything else would make a debugging call silently eat a user's alerts.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.repositories.partner_delivery import PartnerDeliveryRepository
from app.repositories.partners import PartnerCredential, PartnersRepository
from app.schemas.partner import PartnerJob, PartnerJobsResponse
from app.security.partner_auth import SCOPE_JOBS_READ, require_scope
from app.services import partner_alerts

router = APIRouter()


@router.get("/users/{external_id}/jobs", response_model=PartnerJobsResponse)
def user_jobs(
    external_id: str,
    limit: int = Query(default=partner_alerts.DEFAULT_JOBS_PER_USER, ge=1, le=partner_alerts.MAX_JOBS_PER_USER),
    max_experience_years: int | None = Query(default=None, ge=0, le=40),
    include_delivered: bool = Query(
        default=False,
        description="Include openings already pushed to you. Default false — matches what a webhook would carry.",
    ),
    partner: PartnerCredential = Depends(require_scope(SCOPE_JOBS_READ)),
) -> PartnerJobsResponse:
    admin = get_supabase_admin()
    partners_repo = PartnersRepository(admin)
    seat = partners_repo.get_link(partner.partner_id, external_id.strip())
    if not seat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No such user for this partner. Create the seat via POST /partner/v1/sso/session first.",
        )
    if seat.get("link_state") != "linked" or not seat.get("user_id"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This user's Myro account is not linked yet — they were emailed a "
                "sign-in link to confirm the connection."
            ),
        )

    jobs = partner_alerts.jobs_for_seat(
        JobsRepository(admin, admin),
        PartnerDeliveryRepository(admin),
        seat=seat,
        limit=limit,
        max_experience_years=max_experience_years,
        exclude_delivered=not include_delivered,
    )
    return PartnerJobsResponse(
        external_id=external_id,
        user_ref=str(seat["id"]),
        count=len(jobs),
        jobs=[PartnerJob(**job) for job in jobs],
    )
