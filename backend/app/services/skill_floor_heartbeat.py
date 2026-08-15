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
import time
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

# One incident, shared by every production replica. A persistent stall earns at
# most one reminder per day; clearing it earns one recovery receipt.
INCIDENT_REMINDER_SECONDS = 24 * 60 * 60
_INCIDENT_TTL_SECONDS = 35 * 24 * 60 * 60
_INCIDENT_KEY = "ops:incident:skill_floor"
_local_incident_state: dict[str, float | str] = {"state": "closed", "last_alert_at": 0}

_TRANSITION_LUA = """
local state = redis.call('HGET', KEYS[1], 'state')
local last_alert = tonumber(redis.call('HGET', KEYS[1], 'last_alert_at') or '0')
local active = ARGV[1] == '1'
local now = tonumber(ARGV[2])
local reminder = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
if active then
    if state ~= 'open' then
        redis.call('HSET', KEYS[1], 'state', 'open', 'last_alert_at', now)
        redis.call('EXPIRE', KEYS[1], ttl)
        return 'opened'
    end
    if now - last_alert >= reminder then
        redis.call('HSET', KEYS[1], 'last_alert_at', now)
        redis.call('EXPIRE', KEYS[1], ttl)
        return 'reminder'
    end
    return 'quiet'
end
if state == 'open' then
    redis.call('HSET', KEYS[1], 'state', 'closed', 'recovered_at', now)
    redis.call('EXPIRE', KEYS[1], ttl)
    return 'recovered'
end
return 'quiet'
"""


def _owns_alerts() -> bool:
    """Only prod pages; dev observes the same DB and must not page it twice."""
    from app.config import settings

    return settings.is_production


def _local_transition(active: bool, now: int) -> str:
    state = str(_local_incident_state.get("state") or "closed")
    last_alert = int(_local_incident_state.get("last_alert_at") or 0)
    if active:
        if state != "open":
            _local_incident_state.update(state="open", last_alert_at=now)
            return "opened"
        if now - last_alert >= INCIDENT_REMINDER_SECONDS:
            _local_incident_state["last_alert_at"] = now
            return "reminder"
        return "quiet"
    if state == "open":
        _local_incident_state.update(state="closed", recovered_at=now)
        return "recovered"
    return "quiet"


def _incident_transition(active: bool, *, now: float | None = None) -> str:
    """Atomically move the shared incident and return the one action to take."""
    from app.config import settings

    timestamp = int(time.time() if now is None else now)
    redis_url = settings.redis_url.strip()
    if not redis_url:
        return _local_transition(active, timestamp)
    try:
        from redis import Redis

        action = Redis.from_url(redis_url, decode_responses=True).eval(
            _TRANSITION_LUA,
            1,
            _INCIDENT_KEY,
            "1" if active else "0",
            timestamp,
            INCIDENT_REMINDER_SECONDS,
            _INCIDENT_TTL_SECONDS,
        )
        return str(action)
    except Exception as exc:  # noqa: BLE001 — monitoring must not take down the API
        logger.warning(
            "metric skill_floor.incident_state_unavailable exc=%s",
            exc.__class__.__name__,
        )
        return "unavailable"


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
    if not _owns_alerts():
        logger.info(
            "metric skill_floor.alert_skipped reason=non_prod awaiting_stage_a=%d",
            gap.awaiting_stage_a,
        )
        return gap

    recipient = (settings.ops_alert_email or "").strip()
    if not recipient:
        if gap.awaiting_stage_a >= ALERT_ABOVE_AWAITING:
            logger.warning(
                "metric skill_floor.alert_skipped reason=no_recipient awaiting_stage_a=%d",
                gap.awaiting_stage_a,
            )
        return gap

    from app.services.email_service import send_email

    active = gap.awaiting_stage_a >= ALERT_ABOVE_AWAITING
    action = _incident_transition(active)
    if active and action in {"opened", "reminder"}:
        logger.warning(
            "metric skill_floor.alert_fired action=%s awaiting_stage_a=%d",
            action,
            gap.awaiting_stage_a,
        )
        send_email(
            to=recipient,
            subject=f"Myro: {gap.awaiting_stage_a} jobs waiting for a skill floor",
            text=_alert_body(gap),
        )
    elif not active and action == "recovered":
        logger.info("metric skill_floor.alert_recovered total=%d", gap.total)
        send_email(
            to=recipient,
            subject="Myro: skill floor recovered",
            text=(
                "Stage A is moving again: no jobs are waiting for their first skill-floor "
                f"attempt. {gap.total} jobs still carry no skills, {gap.recommendable} of "
                "them recommendable; those are the separate Stage B judgment backlog."
            ),
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
