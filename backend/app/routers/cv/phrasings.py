"""Story phrasings — which line leads, and dropping a weak one.

  POST /cv/reservoir/phrasings/{point_id}/promote   make this the CV line
  POST /cv/reservoir/phrasings/{point_id}/drop      archive this phrasing

A Career Story holds every way the user has written one achievement, gathered
from old CVs, LinkedIn, tailored rewrites and merges (ADR-0021). The drawer in
the story card is where they choose between them.

Both invariants live in SQL (migration 20260912120000), not here: a story keeps
exactly ONE canonical phrasing among its active ones, and never loses its last
one. Archive-not-delete, like the rest of reservoir curation.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel

from app.deps import CurrentUser, get_current_user
from app.repositories.story_identity import StoryIdentityRepository, get_story_identity_repository

router = APIRouter()

_LAST_ONE = "A story keeps its last line. Archive the story instead."
_STALE = "That line has changed since. Refresh to see it."


class PhrasingResponse(BaseModel):
    ok: bool = True


def _conflict(exc: APIError) -> HTTPException:
    """The SQL guard that fired, in the user's words."""
    message = str(getattr(exc, "message", "") or "")
    return HTTPException(status.HTTP_409_CONFLICT, _LAST_ONE if "last phrasing" in message else _STALE)


@router.post("/reservoir/phrasings/{point_id}/promote", response_model=PhrasingResponse)
def promote_phrasing(
    point_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: StoryIdentityRepository = Depends(get_story_identity_repository),
) -> PhrasingResponse:
    try:
        repo.promote_phrasing(user.id, point_id)
    except APIError as exc:
        raise _conflict(exc) from exc
    return PhrasingResponse()


@router.post("/reservoir/phrasings/{point_id}/drop", response_model=PhrasingResponse)
def drop_phrasing(
    point_id: str,
    user: CurrentUser = Depends(get_current_user),
    repo: StoryIdentityRepository = Depends(get_story_identity_repository),
) -> PhrasingResponse:
    try:
        repo.drop_phrasing(user.id, point_id)
    except APIError as exc:
        raise _conflict(exc) from exc
    return PhrasingResponse()
