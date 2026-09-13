"""The standing completion queue — answering a bullet's question without a job.

  POST /cv/reservoir/stories/{story_id}/answer     tell Myro the missing fact
  POST /cv/reservoir/stories/{story_id}/set-aside  "there is no number for this"
  POST /cv/reservoir/questions/reopen              ask me about them again

The queue itself rides `GET /cv/reservoir/profile`, which already reads every
active story and every canonical pointer — see `story_questions`.

This is the second of the two places one question is asked (#13 L3). The job
room asks it inside `/cv/weave/answer` when a job needs that bullet; here the
user answers it on their own time. Both end in the same place: an inflow
carrying `upgrades_story_id`, which the ingest folds into that same story, so
the answer improves the story everywhere rather than minting a sibling.

The story id comes from the path, but it is never trusted from the path: the
row is read back under the caller's own token first, so an answer can only ever
be grafted onto a story the caller owns.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.deps import CurrentUser, get_current_user
from app.repositories.career_reservoir import (
    CareerReservoirRepository,
    get_career_reservoir_repository,
)
from app.repositories.cv_dump import CvDumpRepository, get_cv_dump_repository
from app.services import career_reservoir, cv_weave_interview

router = APIRouter()

#: Its own source so the inflow ledger can tell a bullet the user finished from
#: a gap answer a job asked for. Both are `kind='answer'` — both are extracted.
COMPLETION_SOURCE = "story_completion"


class CompletionAnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)
    final: bool = False


class CompletionAnswerResponse(BaseModel):
    follow_up: str | None = None
    entry_id: str | None = None


class SetAsideRequest(BaseModel):
    aside: bool = True


class SetAsideResponse(BaseModel):
    aside: bool


class ReopenResponse(BaseModel):
    reopened: int


def _own_story(repo: CareerReservoirRepository, user_id: str, story_id: str) -> dict:
    story = next(
        (s for s in repo.list_stories(user_id) if str(s["id"]) == story_id), None,
    )
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found.")
    return story


@router.post("/reservoir/stories/{story_id}/answer", response_model=CompletionAnswerResponse)
def answer_completion(
    story_id: str,
    body: CompletionAnswerRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
    dump_repo: CvDumpRepository = Depends(get_cv_dump_repository),
) -> CompletionAnswerResponse:
    """Bank the fact the bullet was missing, against the story it belongs to.

    Same ONE pointed probe as the job-room interview (L4): a thin answer embeds
    weakly and poisons future coverage, so it gets asked once more before it is
    banked — and skipping the probe still banks, because a fact the user cannot
    give is not a reason to lose the one they did.
    """
    story = _own_story(repo, user.id, story_id)
    answer = body.answer.strip()
    if len("".join(answer.split())) < 12:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Tell me a bit more so I can capture it.",
        )
    if not body.final:
        follow_up = cv_weave_interview.follow_up_for(answer)
        if follow_up:
            return CompletionAnswerResponse(follow_up=follow_up)

    title = " ".join(str(story.get("title") or "").split())
    framed = f"Career experience — {title}:\n{answer}" if title else f"Career experience:\n{answer}"
    row = dump_repo.add(
        user.id, framed, source=COMPLETION_SOURCE,
        kind="answer", payload={"upgrades_story_id": story_id, "via": "stories"},
    )
    entry_id = str(row.get("id") or "")
    if not entry_id:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not save your answer.")
    career_reservoir.enqueue_ingest(user.id, entry_id)
    # Answering IS the un-setting-aside: a bullet the user just told us more
    # about must not stay filed under "no number to give".
    if story.get("completion_declined_at"):
        repo.set_completion_declined(user.id, story_id, False)
    return CompletionAnswerResponse(entry_id=entry_id)


@router.post("/reservoir/stories/{story_id}/set-aside", response_model=SetAsideResponse)
def set_aside_completion(
    story_id: str,
    body: SetAsideRequest,
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> SetAsideResponse:
    """Some work genuinely has no number, and ADR-0016 forbids inventing one.
    Without this the queue is a counter that can never reach zero."""
    _own_story(repo, user.id, story_id)
    repo.set_completion_declined(user.id, story_id, body.aside)
    return SetAsideResponse(aside=body.aside)


@router.post("/reservoir/questions/reopen", response_model=ReopenResponse)
def reopen_completions(
    user: CurrentUser = Depends(get_current_user),
    repo: CareerReservoirRepository = Depends(get_career_reservoir_repository),
) -> ReopenResponse:
    """Ask me again. A set-aside bullet is a decision, not a locked door."""
    return ReopenResponse(reopened=repo.clear_completion_declines(user.id))
