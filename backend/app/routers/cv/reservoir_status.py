"""The one cheap read behind "Myro is updating your CV".

  GET /cv/reservoir/status   pending ingests + whether a CV landed recently

Myro does not backfill (see `services/forward_pass`): a user who uploaded before
a capability existed is brought forward the first time they come back and open
their CV. That pass is enqueue-only and silent, and silence is the problem it
leaves behind — the live "Reading N additions" line lives on `/cv?view=stories`,
and `/cv` opens on `view=cv`. So the work happens on a tab the user is not on.

This endpoint is what lets the default CV view say it out loud. It exists as its
own route rather than a field on `/cv/reservoir/profile` because that read loads
every role, story and pointer a user has; polling it every four seconds from the
busiest authed page would undo the read-path budget it was written to respect.
Three columns, one indexed read, and it stops being polled the moment the count
reaches zero.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import CurrentUser, get_current_user
from app.repositories.career_reservoir import (
    CareerReservoirRepository,
    get_career_reservoir_repository,
)

router = APIRouter()

#: How long after a CV lands the panel still has something to say. Long enough
#: to survive a reload, a closed laptop and a walk to the kettle; short enough
#: that it is gone by the next visit and never becomes furniture on `/cv`.
RECENT_WINDOW_HOURS = 24


class ReservoirStatus(BaseModel):
    #: Inflows still being read. > 0 means a spinner is honest.
    pending: int
    #: A CV finished landing inside the window — the questions it raised are
    #: worth showing even though nothing is in flight any more.
    banked_recently: bool


@router.get("/reservoir/status", response_model=ReservoirStatus)
def reservoir_status(
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> ReservoirStatus:
    since = datetime.now(timezone.utc) - timedelta(hours=RECENT_WINDOW_HOURS)
    return ReservoirStatus(**repo.forward_pass_status(user.id, since=since))
