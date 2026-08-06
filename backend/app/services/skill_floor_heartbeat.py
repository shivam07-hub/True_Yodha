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
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover — import kept out of the hot boot path
    from app.services.skill_floor import FloorGap

logger = logging.getLogger(__name__)

# The count itself is ~2ms (a partial index on a trigger-maintained boolean), so
# the interval is about alert fatigue, not cost. Do not shorten it to "get faster
# alerts" — a rising floor gap is a pipeline fault, and a pipeline fault does not
# become more actionable by being reported twelve times an hour.
HEARTBEAT_SECONDS = 6 * 60 * 60

# Alert on the STALL, not on the backlog. A job Stage A has already tried and
# found no taxonomy skill in is waiting on Stage B's judgment pass — a known,
# unactionable number that would fire this alert every six hours until S2 ships,
# and an alert that always fires is one nobody reads. A job with no floor that
# has never been ATTEMPTED means the pipeline is not running, which is the
# absence-of-signal this exists to catch.
ALERT_ABOVE_AWAITING = 100


def _alert_body(gap: "FloorGap") -> str:
    return (
        f"{gap.awaiting_stage_a} jobs are waiting for a skill floor that has never run "
        f"({gap.total} carry no skills at all, {gap.recommendable} of them recommendable).\n\n"
        "These are invisible to the matcher: the candidate pool is job_skills-derived, "
        "so a job with no rows can never be matched to anyone.\n\n"
        "Close it with:  python -m app.workers.skill_floor_cli --apply"
    )


def check_once() -> "FloorGap":
    """Emit the gap; alert only when work is queued and not moving."""
    from app.config import settings
    from app.database import get_supabase_admin_batch
    from app.services import skill_floor

    gap = skill_floor.count_missing_floor(get_supabase_admin_batch())
    logger.info(
        "metric skill_floor.gap total=%d recommendable=%d awaiting_stage_a=%d",
        gap.total, gap.recommendable, gap.awaiting_stage_a,
    )
    if gap.awaiting_stage_a < ALERT_ABOVE_AWAITING:
        return gap

    recipient = (settings.ops_alert_email or "").strip()
    if not recipient:
        logger.warning(
            "metric skill_floor.alert_skipped reason=no_recipient awaiting_stage_a=%d",
            gap.awaiting_stage_a,
        )
        return gap

    from app.services.email_service import send_email

    logger.warning("metric skill_floor.alert_fired awaiting_stage_a=%d", gap.awaiting_stage_a)
    send_email(
        to=recipient,
        subject=f"Myro: {gap.awaiting_stage_a} jobs waiting for a skill floor",
        text=_alert_body(gap),
    )
    return gap


async def run_forever() -> None:  # pragma: no cover — the loop itself is the schedule
    """Heartbeat loop. A failed check must never take the web process with it."""
    while True:
        try:
            await asyncio.to_thread(check_once)
        except Exception:
            logger.exception("skill floor heartbeat failed")
        await asyncio.sleep(HEARTBEAT_SECONDS)
