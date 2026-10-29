"""application_yes — the person's own statement that they sent this job's application.

CONTEXT.md → Application Yes. The Yes is `job_applications.applied_at` and
nothing else; the north star counts it (DECISIONS APPLY1, amended 2026-10-27).
The stage (`status`) is a separate question — where the application is now.

Five doors used to write the Yes four ways. The tracker and the filing receipt
did the full set; hosted Apply here stamped the date and skipped the CV, the
judge and the door; a job logged as already applied and a `saved → interviewing`
drag wrote no `applied_at` at all, so the north star never saw them. Every door
now comes through here, and a first Yes does everything a first Yes entails:

  stamp `applied_at`, answer open apply intents, freeze the CV of record,
  open the judge, write the door.

Rules (Shivam, 2026-10-27):

  sent stays sent        a Yes survives the stage moving on to interviewing,
                         ghosted, rejected or offer.
  a sent stage implies   moving a job from saved straight to any sent stage
  the Yes                writes the Yes at that moment.
  back to saved          the person is saying they did not send it; `applied_at`
  withdraws it           is cleared. The door log and the frozen CV stay as
                         history, and a later Yes freezes a fresh CV.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.schemas.jobs import APPLICATION_STATUSES
from app.services import core_loop, cv_of_record
from app.services.matching import on_demand
from app.services.model_outcome import is_settled_permanent

#: Every stage past saved. Reaching any of them means the person sent it.
SENT_STAGES: frozenset[str] = frozenset(APPLICATION_STATUSES - {"saved"})

#: Doors that only know the application was sent. The tracker's doors are the
#: surface the answer came from (`PUT /jobs/applications/{id}` `surface`).
DOOR_HOSTED = "hosted"
DOOR_LOGGED = "logged"
DOOR_FILING = "filing_receipt"


@dataclass(frozen=True)
class Move:
    prior_status: str | None
    status: str
    applied_at: str | None
    yes: bool  # this write recorded the first Yes
    withdrawn: bool  # this write withdrew a Yes


def move(
    repo: Any,
    tasks: Any,
    *,
    user_id: str,
    job_id: str,
    stage: str,
    door: str | None,
    fields: dict[str, Any] | None = None,
) -> Move:
    """The person set this job's stage. The Yes follows the stage it implies."""
    existing = repo.get_application_with_job(user_id, job_id) or {}
    return _write(repo, tasks, existing, user_id, job_id, stage, door, fields)


def say_yes(
    repo: Any,
    tasks: Any,
    *,
    user_id: str,
    job_id: str,
    door: str,
    fields: dict[str, Any] | None = None,
) -> Move:
    """A door that knows only that it was sent. The stage becomes `applied`
    unless the person is already further along — a Yes never moves it back."""
    existing = repo.get_application_with_job(user_id, job_id) or {}
    prior = existing.get("status")
    stage = prior if prior in SENT_STAGES else "applied"
    return _write(repo, tasks, existing, user_id, job_id, stage, door, fields)


def _write(
    repo: Any,
    tasks: Any,
    existing: dict[str, Any],
    user_id: str,
    job_id: str,
    stage: str,
    door: str | None,
    fields: dict[str, Any] | None,
) -> Move:
    now = datetime.now(timezone.utc).isoformat()
    prior = existing.get("status")
    held = existing.get("applied_at")
    yes = stage in SENT_STAGES and held is None
    withdrawn = stage not in SENT_STAGES and held is not None

    updates: dict[str, Any] = {**(fields or {}), "status": stage}
    if stage != prior:
        updates["last_stage_changed_at"] = now
    if yes:
        updates["applied_at"] = now
    if withdrawn:
        updates["applied_at"] = None
    repo.upsert_application(user_id, job_id, updates)

    if stage in SENT_STAGES:
        repo.answer_apply_intents(user_id, job_id)
    if yes:
        cv_of_record.record_on_apply(user_id, job_id, since=now)
        # A stored verdict makes this a no-op; it never waits on a model.
        tasks.add_task(on_demand.open_job_eval, repo, user_id, job_id)
        # Server-side only: a client beacon could forge the north star's door count.
        tasks.add_task(core_loop.record_step, user_id, job_id, "applied", door)

    applied_at = now if yes else (None if withdrawn else held)
    return Move(prior, stage, applied_at, yes, withdrawn)


def unrated_yes_job_ids(db: Any, user_id: str) -> list[str]:
    """The person's Yeses the judge has not rated and still can.

    Without a rating a Yes can never count as qualified, and an absent rating is
    not a verdict. A permanent Model Outcome is settled, and a job whose listing
    has been deleted has nothing left to rate — neither is asked again.
    """
    yeses = (
        db.table("job_applications")
        .select("job_id")
        .eq("user_id", user_id)
        .not_.is_("applied_at", "null")
        .limit(50)
        .execute()
        .data
        or []
    )
    job_ids = [str(row["job_id"]) for row in yeses if row.get("job_id")]
    if not job_ids:
        return []
    verdicts = (
        db.table("user_job_matches")
        .select("job_id, overall_score, eval_outcome")
        .eq("user_id", user_id)
        .in_("job_id", job_ids)
        .execute()
        .data
        or []
    )
    done = {
        str(row["job_id"])
        for row in verdicts
        if row.get("overall_score") is not None or is_settled_permanent(row)
    }
    waiting = [job_id for job_id in job_ids if job_id not in done]
    if not waiting:
        return []
    present = {
        str(row["job_id"])
        for row in (
            db.table("jobs").select("job_id").in_("job_id", waiting).execute().data or []
        )
    }
    return [job_id for job_id in waiting if job_id in present]
