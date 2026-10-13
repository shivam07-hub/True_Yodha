"""The Return door's work — what a present person's job list is behind on.

`forward_pass.reread_list` claims and enqueues this from `/users/me`, the shell on
every authed page. The check runs here, on the Work Lane, because it needs reads
the shell does not hold (memory, the latest CV, the verdict keys) and the shell is
the slowest door Myro has. It spends no model call; it decides whether one is owed.
(`ARCHITECTURE_RETURN_LOOP.md` §4B, BACKLOG #55 S3.)

Two cases, each finishing work the person started:

- **A CV no run has read.** The latest Main CV holds no verdict while an earlier
  one does. A Main CV edit — certificate, skill edit, rewrite, merge — writes a new
  baseline and asks only for a skill re-tag, never a match, so every verdict reads
  `foreign` and the list is the replaced CV's until something reads the new one.
  On 2026-10-13, 18 people sat there. → `initial_match` once per CV, after the
  grace in which an upload's own run is still landing.
- **Stale cards on the list.** Verdicts judged for this CV and direction under
  rules or facts that have since moved. → the drain, once per change, which
  re-reads the cards they can already see before anything else
  (`feed_warm.run_feed_warm`).

A third, smaller one (S5): **an Apply click with no save.** Since 2026-09-28
(`3ff55125`) a click files the job as saved, so "Did you apply?" has a row to ask
on; clicks before that have none and are never asked. They are filed now, by the
same rule, unless the person has since dismissed the job.

Nothing here runs for someone who is not present: the door is a page they opened.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.services import background
from app.services.matching import published_list
# A Main CV younger than this may still have its own run landing (an upload
# enqueues one) or its skills re-tagged (an edit). The match waits for both.
from app.services.matching.match_freshness import RUN_GRACE_SECONDS

logger = logging.getLogger(__name__)

#: One run per CV, ever: a run that landed leaves verdicts, and one that failed
#: is the failed-run alert's to raise, not a reason to re-run on every visit.
_CV_CLAIM_SECONDS = 30 * 24 * 60 * 60
#: One re-read per change of rules or facts per day. A drain that died gets
#: another go tomorrow; one that is draining is not started twice.
_REREAD_CLAIM_SECONDS = 24 * 60 * 60
#: Clicks can no longer be orphaned (the click saves), so the look for old
#: ones is weekly per person — cheap, and still a retry if a write failed.
_CLICKS_CLAIM_SECONDS = 7 * 24 * 60 * 60


def _age_seconds(stamp: Any, now: datetime) -> float:
    try:
        moment = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
    except ValueError:
        return float("inf")
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return (now - moment).total_seconds()


def check(repo: Any, user_id: str, *, now: datetime | None = None) -> str:
    """Decide and enqueue. Returns what it did, for the metric and the tests."""
    from app.services import direction
    from app.services.job_refresh._dispatch import user_has_live_refresh
    from app.services.matching import feed_warm, targeting, verdict_currency

    if user_has_live_refresh(user_id):
        return "running"
    latest = repo.get_latest_baseline_stamp(user_id)
    if not latest:
        return "no_cv"
    profile = targeting.for_currency(repo, user_id).ranking_profile()
    if not direction.of(profile).families:
        return "no_direction"
    baseline_id = int(latest["id"])

    if not repo.has_verdict(user_id, baseline_version_id=baseline_id):
        if not repo.has_verdict(user_id):
            # Never matched at all: the onboarding run and `finish_outstanding_match`
            # own a first search. This door only re-reads a list that existed.
            return "never_matched"
        if _age_seconds(latest.get("created_at"), now or datetime.now(timezone.utc)) < RUN_GRACE_SECONDS:
            return "cv_settling"
        if not background.claim(f"list_reread:cv:{user_id}:{baseline_id}", _CV_CLAIM_SECONDS):
            return "claimed"
        background.enqueue(
            background.LANE_FAST,
            "initial_match",
            payload={"user_id": user_id, "force_context_refresh": True},
            correlation_id=f"cv-reread:{user_id}:{baseline_id}",
        )
        return "cv_run"

    profile["baseline_version_id"] = baseline_id
    currency = verdict_currency.for_profile(profile)
    stale = [
        row for row in repo.get_shown_verdict_keys(user_id, floor=published_list.SHOW_FLOOR)
        if currency.of(row) == "stale"
        and published_list.worth_showing(row.get("overall_score"), row.get("recommendation"))
    ]
    if not stale:
        return "current"
    if not background.claim(f"list_reread:rules:{user_id}:{currency.marker()}", _REREAD_CLAIM_SECONDS):
        return "claimed"
    feed_warm.enqueue_feed_warm(user_id, announce=True)
    return "reread"


def file_apply_clicks(repo: Any, user_id: str, *, now: datetime | None = None) -> int:
    """File each unanswered Apply click that has no save, as the click path does
    today. Returns how many were filed."""
    if not background.claim(f"list_reread:apply_clicks:{user_id}", _CLICKS_CLAIM_SECONDS):
        return 0
    moment = now or datetime.now(timezone.utc)
    clicked = repo.get_pending_apply_intent_job_ids(
        user_id, older_than=moment, newer_than=datetime(2000, 1, 1, tzinfo=timezone.utc),
    )
    if not clicked:
        return 0
    # A job they dismissed after clicking stays dismissed: the dismissal removed
    # the save on purpose.
    dismissed = set(repo.get_dismissed_job_card_ids(user_id))
    filed = 0
    for job_id in sorted(clicked - dismissed):
        if repo.get_application_with_job(user_id, job_id):
            continue
        repo.upsert_application(user_id, job_id, {"status": "saved", "source": "user_discovery"})
        filed += 1
    return filed


@background.handler("list_reread")
async def _list_reread_handler(payload: dict[str, Any], allow_retry: bool) -> None:  # noqa: ARG001
    from app.database import get_supabase_admin
    from app.repositories.jobs import JobsRepository

    user_id = str(payload["user_id"])
    db = get_supabase_admin()
    repo = JobsRepository(db, db)
    filed = file_apply_clicks(repo, user_id)
    outcome = check(repo, user_id)
    logger.warning(
        "metric list_reread.checked user=%s outcome=%s apply_clicks_filed=%d",
        user_id, outcome, filed,
    )
