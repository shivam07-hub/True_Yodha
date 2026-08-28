"""Job Tracks — HTTP for a user's second and third job searches.

Transport only; every decision is one line and delegates into
`app/services/job_tracks.py`.

Two things this router will not do, both deliberate:

* **It never invents track 1.** `GET /tracks` returns the profile track first,
  built from `user_profiles`, with `id: null`. A client that sees one track and
  a locked gate is looking at the 83% case, which is the normal one.
* **It never opens a track the service says is not earned.** `can_open_another`
  is checked server-side on POST, because a client that forgets the gate would
  otherwise hand someone a second search before they have finished the first —
  and the whole point of the gate is that the second one means something.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client

from app.deps import Principal, get_principal, get_user_db
from app.repositories.job_tracks import JobTracksRepository
from app.repositories.onboarding import OnboardingRepository
from app.repositories.users import UsersRepository
from app.services import job_tracks

router = APIRouter(prefix="/tracks", tags=["tracks"])


class TrackOut(BaseModel):
    """One search. `id` is null for track 1 — the profile, which has no row."""

    id: int | None = None
    label: str
    role_titles: list[str] = []
    position: int
    is_profile: bool


class TracksOut(BaseModel):
    tracks: list[TrackOut]
    #: Whether another search can be opened right now, and if not, the next step
    #: that would open it. Never the word "locked" — a lock explains nothing.
    can_open: bool
    blocked_reason: str | None = None
    max_tracks: int = job_tracks.MAX_TRACKS


class TrackIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    role_titles: list[str] = Field(default_factory=list)


class TrackPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=60)
    role_titles: list[str] | None = None


def _repos(db: Client) -> tuple[JobTracksRepository, UsersRepository, OnboardingRepository]:
    return JobTracksRepository(db), UsersRepository(db), OnboardingRepository(db)


def _state(db: Client, user_id: str) -> TracksOut:
    tracks_repo, users_repo, onboarding_repo = _repos(db)
    profile = users_repo.get_profile(user_id) or {}
    tracks = job_tracks.tracks_for(tracks_repo, user_id, profile)
    can_open, reason = job_tracks.can_open_another(
        tracks, onboarding_repo.get_state(user_id)
    )
    return TracksOut(
        tracks=[TrackOut(**track.to_dict()) for track in tracks],
        can_open=can_open,
        blocked_reason=reason,
    )


@router.get("", response_model=TracksOut)
def list_tracks(
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> TracksOut:
    """Every search this user has, track 1 first, plus whether another can open."""
    return _state(db, principal.id)


@router.post("", response_model=TracksOut, status_code=status.HTTP_201_CREATED)
def open_track(
    body: TrackIn,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> TracksOut:
    """Open a second or third search.

    409 rather than 403 when the gate is shut: nothing is wrong with the
    request or the caller's permissions — the account is simply not in a state
    where this exists yet, and the reason says what would change that.
    """
    tracks_repo, users_repo, onboarding_repo = _repos(db)
    profile = users_repo.get_profile(principal.id) or {}
    existing = job_tracks.tracks_for(tracks_repo, principal.id, profile)
    can_open, reason = job_tracks.can_open_another(
        existing, onboarding_repo.get_state(principal.id)
    )
    if not can_open:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=reason)

    created = tracks_repo.create(
        principal.id,
        label=body.label.strip(),
        role_titles=job_tracks.normalise_role_titles(body.role_titles),
        position=job_tracks.next_position(existing),
    )
    if created is None:
        # The unique index refused it — someone opened a track between the read
        # above and this write. Their track exists; re-read rather than retry.
        return _state(db, principal.id)
    return _state(db, principal.id)


@router.patch("/{track_id}", response_model=TracksOut)
def rename_track(
    track_id: int,
    body: TrackPatch,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> TracksOut:
    """Change a track's words. Absent fields are untouched, never cleared."""
    tracks_repo, _users, _onboarding = _repos(db)
    patch: dict[str, object] = {}
    if body.label is not None:
        patch["label"] = body.label.strip()
    if body.role_titles is not None:
        patch["role_titles"] = job_tracks.normalise_role_titles(body.role_titles)
    if patch and tracks_repo.update(principal.id, track_id, patch) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such search.")
    return _state(db, principal.id)


@router.delete("/{track_id}", response_model=TracksOut)
def close_track(
    track_id: int,
    principal: Principal = Depends(get_principal),
    db: Client = Depends(get_user_db),
) -> TracksOut:
    """Close a search. Archives it — the matches it found keep pointing at it,
    and its position frees up for a new one."""
    tracks_repo, _users, _onboarding = _repos(db)
    if not tracks_repo.archive(principal.id, track_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such search.")
    return _state(db, principal.id)
