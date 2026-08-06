"""Dead-man heartbeat for the skill floor.

A job with no skills reaches no user. That failure is silent by construction:
every gate stays green, the API answers 200, and the only visible symptom is
matches that quietly do not exist. It ran for four months and 6,252 jobs.

This lives in the web process on purpose. The enrichment worker cannot report
that the enrichment worker is not running — a metric emitted BY a process can
only ever describe the runs that happened. The web app is the always-up process,
so it is the one that can notice an absence.
"""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

# The count itself is ~2ms (a partial index on a trigger-maintained boolean), so
# the interval is about alert fatigue, not cost. Do not shorten it to "get faster
# alerts" — a rising floor gap is a pipeline fault, and a pipeline fault does not
# become more actionable by being reported twelve times an hour.
HEARTBEAT_SECONDS = 6 * 60 * 60

# Recommendable jobs are the ones a user can actually be matched to, so they are
# what the alert is about. A closed listing with no skills harms nobody.
ALERT_ABOVE_RECOMMENDABLE = 100


def _alert_body(total: int, recommendable: int) -> str:
    return (
        f"{recommendable} recommendable jobs carry no job_skills row "
        f"({total} across the whole corpus).\n\n"
        "These are invisible to the matcher: the candidate pool is job_skills-derived, "
        "so a job with no rows can never be matched to anyone.\n\n"
        "Close it with:  python -m app.workers.skill_floor_cli --apply"
    )


def check_once() -> tuple[int, int]:
    """Emit the gap, alert if recommendable jobs are affected. Never raises."""
    from app.config import settings
    from app.database import get_supabase_admin_batch
    from app.services import skill_floor

    total, recommendable = skill_floor.count_missing_floor(get_supabase_admin_batch())
    logger.info("metric skill_floor.gap total=%d recommendable=%d", total, recommendable)
    if recommendable < ALERT_ABOVE_RECOMMENDABLE:
        return total, recommendable

    recipient = (settings.ops_alert_email or "").strip()
    if not recipient:
        logger.warning("metric skill_floor.alert_skipped reason=no_recipient recommendable=%d", recommendable)
        return total, recommendable

    from app.services.email_service import send_email

    logger.warning("metric skill_floor.alert_fired recommendable=%d", recommendable)
    send_email(
        to=recipient,
        subject=f"Myro: {recommendable} matchable jobs have no skills",
        text=_alert_body(total, recommendable),
    )
    return total, recommendable


async def run_forever() -> None:  # pragma: no cover — the loop itself is the schedule
    """Heartbeat loop. A failed check must never take the web process with it."""
    while True:
        try:
            await asyncio.to_thread(check_once)
        except Exception:
            logger.exception("skill floor heartbeat failed")
        await asyncio.sleep(HEARTBEAT_SECONDS)
