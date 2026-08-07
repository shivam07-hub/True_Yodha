"""partner_broadcast — turn "new inventory landed" into one event per seat.

The seam between Myro's own landing signal and a partner's inbox. It walks the
partner's verified seats, asks `partner_alerts` what each one has not been told
about, and emits one `job_matches.new` event per seat that has anything.

One event per user, not one batch for the partner: the partner's job is to email
THAT person, and a batch would make them fan it back out themselves — with our
per-user relevance already thrown away.

Ledger timing: a job is marked delivered when the event is ACCEPTED (its delivery
row exists), not when the partner returns 200. The delivery log owns the retry
after that. If a delivery exhausts its ladder the openings are not re-pushed —
the partner refetches them from `GET /partner/v1/users/{external_id}/jobs`, which
is exactly what that endpoint is for. Re-pushing on failure would replay the same
openings at whatever moment their endpoint came back, which is how a partner ends
up emailing a user twice.
"""
from __future__ import annotations

import logging
from typing import Any

from app.database import get_supabase_admin
from app.repositories.jobs import JobsRepository
from app.repositories.partner_delivery import PartnerDeliveryRepository
from app.repositories.partners import PartnersRepository
from app.services import background, partner_alerts, partner_webhooks

logger = logging.getLogger(__name__)

DEFAULT_SEAT_CAP = 500
_JOB_TYPE = "partner_broadcast"


def broadcast_new_jobs(
    *,
    partner_id: str,
    slug: str,
    jobs_per_user: int = partner_alerts.DEFAULT_JOBS_PER_USER,
    max_experience_years: int | None = None,
    seat_cap: int = DEFAULT_SEAT_CAP,
    dry_run: bool = False,
) -> dict[str, int]:
    """Emit one event per seat with undelivered openings. Returns counts.

    `dry_run` resolves the same jobs and reports the same counts but neither
    emits nor writes the ledger — the honest way to answer "what would this
    partner receive right now".
    """
    admin = get_supabase_admin()
    partners_repo = PartnersRepository(admin)
    delivery_repo = PartnerDeliveryRepository(admin)
    jobs_repo = JobsRepository(admin, admin)

    seats = partners_repo.linked_users(partner_id, limit=seat_cap)
    if len(seats) >= seat_cap:
        logger.warning(
            "metric partner_broadcast.capped partner=%s cap=%d — seats beyond the cap were not served",
            slug, seat_cap,
        )

    events = 0
    jobs_sent = 0
    for seat in seats:
        jobs = partner_alerts.jobs_for_seat(
            jobs_repo,
            delivery_repo,
            seat=seat,
            limit=jobs_per_user,
            max_experience_years=max_experience_years,
        )
        if not jobs:
            continue
        if dry_run:
            events += 1
            jobs_sent += len(jobs)
            continue
        event_id = partner_webhooks.enqueue_event(
            partner_id=partner_id,
            event_type=partner_webhooks.EVENT_JOB_MATCHES,
            payload={
                "partner": slug,
                "user": {
                    "external_id": seat.get("external_id"),
                    "email": seat.get("email"),
                    "user_ref": str(seat.get("id")),
                },
                "jobs": jobs,
            },
        )
        if not event_id:
            # No active endpoint. Stop walking seats — the answer is the same for
            # every one of them, and the ledger must stay untouched so a partner
            # who registers an endpoint tomorrow still gets these openings.
            logger.info("metric partner_broadcast.no_endpoint partner=%s", slug)
            break
        delivery_repo.record_delivered_jobs(str(seat["id"]), [j["job_id"] for j in jobs])
        events += 1
        jobs_sent += len(jobs)

    logger.info(
        "metric partner_broadcast.done partner=%s seats=%d events=%d jobs=%d dry_run=%s",
        slug, len(seats), events, jobs_sent, dry_run,
    )
    return {"seats": len(seats), "events": events, "jobs": jobs_sent}


def broadcast_all(**kwargs: Any) -> dict[str, dict[str, int]]:
    """Run the broadcast for every active partner — the scheduled entry point."""
    admin = get_supabase_admin()
    resp = admin.table("partners").select("id, slug").eq("status", "active").execute()
    results: dict[str, dict[str, int]] = {}
    for row in resp.data or []:
        results[str(row["slug"])] = broadcast_new_jobs(
            partner_id=str(row["id"]), slug=str(row["slug"]), **kwargs
        )
    return results


def enqueue_broadcast(**kwargs: Any) -> None:
    """Defer a broadcast off the request path.

    A fan-out over every seat is one feed query per user; a landing webhook that
    ran it inline would hold the scraper's HTTP call open for minutes and time
    out somewhere in the middle, having already written half the ledger.
    """
    background.enqueue(background.LANE_BULK, _JOB_TYPE, payload=dict(kwargs))


@background.handler(_JOB_TYPE)
async def _broadcast_handler(payload: dict[str, Any], allow_retry: bool) -> None:
    """Fan out to one partner, or to all of them when no slug is given.

    Never raises: a retry would re-walk seats whose ledger rows are already
    written, so the second run would find nothing to send and the first run's
    real failure would be hidden behind a clean-looking retry.
    """
    slug = payload.pop("partner_slug", None)
    try:
        if slug:
            admin = get_supabase_admin()
            partner = PartnersRepository(admin).get_partner_by_slug(str(slug))
            if not partner:
                logger.warning("partner_broadcast: unknown partner slug=%s", slug)
                return
            broadcast_new_jobs(partner_id=str(partner["id"]), slug=str(slug), **payload)
            return
        broadcast_all(**payload)
    except Exception as exc:  # noqa: BLE001 — logged; see docstring
        logger.exception("partner_broadcast failed slug=%s: %s", slug, exc)
