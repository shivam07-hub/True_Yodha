"""Resolve one user's Collection: the union of their match stack and their
saved-job worklist, as one entry per job carrying exactly one stage.

CONTEXT.md → Collection Record. The rules that live here and nowhere else:

  · the stage ladder (found → saved → tailored → applied), highest rung wins
  · liveness demotes `found`/`saved` to `closed` and NOTHING else
  · origin is match-stack membership, never the `source` string
  · the landing stage — the first one still asking something of the user

Every one of those used to be re-derived in two client skins off three caches,
which is how the same job came to sit in two chips at once.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable

from app.services.job_projection import cv_badge_from_row, to_job_match
from app.schemas import (
    STAGE_APPLIED,
    STAGE_CLOSED,
    STAGE_FOUND,
    STAGE_SAVED,
    STAGE_TAILORED,
    CollectionEntry,
    CollectionResponse,
    MatchEval,
)

#: `jobs.listing_confidence` values that mean the ad is gone. One definition,
#: shared with the attention sweep's terminal `closed` level.
LIVENESS_DOWN = frozenset({"closed", "likely_closed"})

#: An apply click older than this with no answer is a question, not a fact. The
#: user tabbed out to the ATS and never came back to the inline band; the surface
#: has to ask again rather than leave the entry looking untouched forever.
PENDING_INTENT_AFTER = timedelta(minutes=10)

#: Low rung → high rung. The entry's stage is the highest one it has reached.
STAGE_ORDER: tuple[str, ...] = (STAGE_FOUND, STAGE_SAVED, STAGE_TAILORED, STAGE_APPLIED)

#: Chip order on every skin, closed last.
STAGE_CHIPS: tuple[str, ...] = (*STAGE_ORDER, STAGE_CLOSED)


def _as_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _liveness(job: dict[str, Any]) -> str:
    """live | uncertain | down — an ATTRIBUTE of the listing, never a stage.

    `is_active is False` counts as down on its own: 16 prod rows carry
    `listing_confidence='closed'` with `is_active` still true and the inverse
    exists too, so reading one column alone disagrees with the other surface.
    """
    if job.get("is_active") is False:
        return "down"
    confidence = str(job.get("listing_confidence") or "").lower()
    if confidence in LIVENESS_DOWN:
        return "down"
    return "live" if confidence == "active" else "uncertain"


def _stage(*, has_application: bool, applied: bool, tailored: bool) -> str:
    if applied:
        return STAGE_APPLIED
    if tailored:
        return STAGE_TAILORED
    if has_application:
        return STAGE_SAVED
    return STAGE_FOUND


def _synth_match_row(app_row: dict[str, Any]) -> dict[str, Any]:
    """An application with no brain verdict, in match-row shape.

    The client used to do this (`synthMatch`) so a saved row could render the
    same FeedCard as a match. Doing it here means one card contract, and means
    `MatchEval` decides the verdict — an unevaluated job reads `checking`, never
    a fabricated score.
    """
    return {
        "id": app_row["id"],
        "job_id": app_row["job_id"],
        "jobs": app_row.get("jobs") or {},
    }


def _needs_user(stage: str, *, pending_apply: bool) -> bool:
    """Does this entry still ask something? Drives the landing stage.

    `closed` never asks — a dead listing is over. `applied` never asks here
    either; chasing a live application is the Prep room's job, and answering it
    from two surfaces is how one number came to have two definitions.

    There used to be a `snoozed` exemption. Snooze existed only to quiet the
    age-based attention nag, which is gone (it produced 0 tailors, 0 applies and
    0 removals across 326 sends); the control was used once, ever. `×` is the
    honest "not this one".
    """
    return bool(pending_apply) or stage in {STAGE_FOUND, STAGE_SAVED, STAGE_TAILORED}


def resolve_collection(
    *,
    applications: Iterable[dict[str, Any]],
    match_rows: Iterable[dict[str, Any]],
    dismissed_job_ids: set[str],
    tailored_by_job: dict[str, dict[str, Any]],
    pending_intent_job_ids: set[str],
    batch_week: date,
    match_health: str = "empty",
) -> CollectionResponse:
    """Union the two spines into one entry per job.

    `match_rows` is the raw stack (already scoped to this user); `applications`
    is the saved-job worklist. A job present in both produces ONE entry — the
    defect this module exists to remove.
    """
    apps_by_job: dict[str, dict[str, Any]] = {}
    for row in applications:
        job_id = str(row.get("job_id") or "")
        if job_id:
            apps_by_job[job_id] = row

    matches_by_job: dict[str, dict[str, Any]] = {}
    below_bar = 0
    rejected = 0
    for row in match_rows:
        job_id = str(row.get("job_id") or "")
        if not job_id:
            continue
        matches_by_job[job_id] = row

    entries: list[CollectionEntry] = []
    seen: set[str] = set()

    def _append(job_id: str, match_row: dict[str, Any] | None, app_row: dict[str, Any] | None) -> None:
        if job_id in seen:
            return
        seen.add(job_id)
        source_row = match_row if match_row is not None else _synth_match_row(app_row or {})
        job = source_row.get("jobs") or {}
        tailored_head = tailored_by_job.get(job_id)
        applied = bool(app_row) and str(app_row.get("status") or "saved") != "saved"
        stage = _stage(
            has_application=app_row is not None,
            applied=applied,
            tailored=tailored_head is not None,
        )
        liveness = _liveness(job)
        # A dead ad ends a hunt that had not started. It does not undo work
        # already done: `tailored` and `applied` keep their stage, their CV and
        # their Prep room, and say so with a trust line instead.
        if liveness == "down" and stage in {STAGE_FOUND, STAGE_SAVED}:
            stage = STAGE_CLOSED
        pending_apply = job_id in pending_intent_job_ids and not applied
        entries.append(
            CollectionEntry(
                job_id=job_id,
                stage=stage,
                origin="myro" if match_row is not None else _origin_of(app_row),
                liveness=liveness,
                job=to_job_match(source_row, batch_week),
                status=(app_row or {}).get("status") if app_row else None,
                notes=(app_row or {}).get("notes"),
                cv_badge=cv_badge_from_row(tailored_head),
                pending_apply=pending_apply,
                saved_at=_as_datetime((app_row or {}).get("created_at")),
                applied_at=_as_datetime((app_row or {}).get("applied_at")),
                needs_user=_needs_user(stage, pending_apply=pending_apply),
            )
        )

    # Matches first so a job in both spines is resolved against its real verdict.
    for job_id, row in matches_by_job.items():
        if job_id in dismissed_job_ids:
            continue
        app_row = apps_by_job.get(job_id)
        ev = MatchEval.model_validate(row)
        bucket = _classify(ev)
        if app_row is None:
            # An untouched match only earns an entry if it cleared the bar.
            # Below-bar lives on /market; rejected is for-cause and hidden.
            if bucket == "rejected":
                rejected += 1
                continue
            if bucket == "below":
                below_bar += 1
                continue
        _append(job_id, row, app_row)

    # Applications with no match row (extension imports, manual adds, jobs saved
    # before this user ever ran a search).
    for job_id, app_row in apps_by_job.items():
        _append(job_id, None, app_row)

    stages = {stage: 0 for stage in STAGE_CHIPS}
    for entry in entries:
        stages[entry.stage] = stages.get(entry.stage, 0) + 1

    return CollectionResponse(
        entries=entries,
        stages=stages,
        landing=_landing(entries),
        below_bar_count=below_bar,
        rejected_count=rejected,
        match_health=match_health,
    )


def _origin_of(app_row: dict[str, Any] | None) -> str:
    """Who put this here. Read from the spine, not the `source` string.

    `job_applications.source` cannot answer this: the column DEFAULTS to
    `system_match` while every save path writes `user_discovery`, so it labelled
    a role Myro found as "You added" and a role the user applied to off /market
    as Myro's. Match-stack membership is checked by the caller; what is left here
    is only telling an extension import from a manual one.
    """
    source = str((app_row or {}).get("source") or "").lower()
    job_id = str((app_row or {}).get("job_id") or "")
    if job_id.startswith("ext_") or "ext" in source or "chrome" in source:
        return "extension"
    return "you"


def _classify(ev: MatchEval) -> str:
    """above | below | rejected — the same threshold rule as the Match Verdict,
    applied ONCE, server-side. The client had grown its own copy back."""
    if (ev.legitimacy_tier or "").lower() == "suspicious":
        return "rejected"
    if (ev.recommendation or "").lower() == "skip":
        return "rejected"
    return "above" if ev.is_strong or ev.verdict == "worth_it" else "below"


def _landing(entries: list[CollectionEntry]) -> str:
    """The first stage holding an entry that still needs the user.

    Stages are for working; they are never a toll on finding your work. A
    settled collection lands on `tailored` — the goal step — instead of parking
    everyone on `found` whether or not anything there is asking.
    """
    for stage in STAGE_ORDER:
        if any(e.stage == stage and e.needs_user for e in entries):
            return stage
    # Nothing is asking. Open on the FURTHEST stage that holds work, not the
    # earliest: walking forward lands a board of "one snoozed save + three live
    # applications" on the save the user explicitly asked not to be shown.
    for stage in reversed(STAGE_ORDER):
        if any(e.stage == stage for e in entries):
            return stage
    return STAGE_FOUND
