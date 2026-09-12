"""Stories review space — the questions Myro cannot answer alone.

  GET  /cv/reservoir/review               what is waiting, what was merged for
                                          you, and how much you have decided
  POST /cv/reservoir/review/stories       your ruling on a pair: merged | keep_separate
  POST /cv/reservoir/review/stories/undo  take back a fold Myro made

Story identity is decided in app/services/story_identity.py; this router only
carries the user's rulings to it. Roles keep their own verdict endpoint in
career.py — the review space shows both queues in one place.

The GET also enqueues the lazy identity sweep: compute only where someone is
about to look at the result.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import CurrentUser, get_current_user
from app.repositories.career_reservoir import (
    CareerReservoirRepository,
    get_career_reservoir_repository,
)
from app.repositories.story_identity import StoryIdentityRepository, get_story_identity_repository
from app.services import story_identity, story_review

router = APIRouter()


class ReviewStory(BaseModel):
    id: str
    title: str
    role_label: str = ""
    pointer: str = ""
    variant_count: int = 0


class StoryPair(BaseModel):
    story_a: str
    story_b: str
    a: ReviewStory
    b: ReviewStory


class RolePair(BaseModel):
    role_a: str
    role_b: str
    a_label: str
    b_label: str


class FoldReceipt(BaseModel):
    story_a: str
    story_b: str
    kept: str
    merged: str
    when: str = ""


class ReviewView(BaseModel):
    story_pairs: list[StoryPair] = Field(default_factory=list)
    role_pairs: list[RolePair] = Field(default_factory=list)
    merged_for_you: list[FoldReceipt] = Field(default_factory=list)
    you_decided: int = 0
    #: roles Myro folded on its own lately — counted, not undoable here
    tidied_roles: int = 0


@router.get("/reservoir/review", response_model=ReviewView)
def reservoir_review(
    user: CurrentUser = Depends(get_current_user),
    repo: StoryIdentityRepository = Depends(get_story_identity_repository),
    career: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> ReviewView:
    story_identity.maybe_enqueue(user.id)
    return ReviewView(**story_review.build_review(
        proposals=repo.proposals(user.id),
        role_proposals=career.merge_proposals(user.id),
        folds=repo.recent_folds(user.id),
        stories=repo.all_stories_brief(user.id),
        roles=career.list_roles(user.id),
        pointers=repo.all_story_pointers(user.id),
        user_ruled=repo.user_ruled_count(user.id),
        tidied_roles=career.recent_auto_folds(user.id),
    ))


class StoryVerdictRequest(BaseModel):
    story_a: str
    story_b: str
    verdict: str = Field(pattern="^(merged|keep_separate)$")


class StoryVerdictResponse(BaseModel):
    verdict: str


@router.post("/reservoir/review/stories", response_model=StoryVerdictResponse)
def story_merge_verdict(
    body: StoryVerdictRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: StoryIdentityRepository = Depends(get_story_identity_repository),
) -> StoryVerdictResponse:
    try:
        story_identity.decide(repo, user.id, body.story_a, body.story_b, body.verdict)
    except story_identity.StoryIdentityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return StoryVerdictResponse(verdict=body.verdict)


class StoryUndoRequest(BaseModel):
    story_a: str
    story_b: str


@router.post("/reservoir/review/stories/undo", response_model=StoryVerdictResponse)
def story_merge_undo(
    body: StoryUndoRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: StoryIdentityRepository = Depends(get_story_identity_repository),
) -> StoryVerdictResponse:
    try:
        story_identity.undo(repo, user.id, body.story_a, body.story_b)
    except story_identity.StoryIdentityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return StoryVerdictResponse(verdict="keep_separate")
