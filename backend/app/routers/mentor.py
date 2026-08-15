"""POST /mentor/converse — one Myro, whichever screen you are on.

Replaces the shape of `/jobs/intent-chat`, not its behaviour. That route still
exists and now delegates here, because it is live and the point of this slice is
one seam, not a flag day: the frontend moves surface by surface, and the old
path is deleted in its own commit once nothing calls it. Dropping a column
before the code that reads it had shipped cost this project four minutes of
broken production earlier the same week; the same rule applies to a route.

`surface` selects the task framing and which proposals are possible — never the
personality. One voice, four jobs (see myro_voice, mentor).
"""
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel, Field

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.search_queries import SearchQueriesRepository
from app.services import mentor, mentor_learn
from app.services.llm_provider import LLMProvider, get_interactive_provider

router = APIRouter(prefix="/mentor", tags=["mentor"])


class MentorMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class MentorConverseRequest(BaseModel):
    # The four surfaces of MYRO_MENTOR's seam. An unknown value is a 422 rather
    # than a silent fallback — a surface Myro does not know is a surface whose
    # proposals it cannot reason about.
    surface: Literal["cv", "skills", "job_intent", "prep"]
    messages: list[MentorMessage] = Field(min_length=1, max_length=20)


class MentorFilterDiff(BaseModel):
    add_roles: list[str] = Field(default_factory=list)
    remove_roles: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    seniority: str | None = None
    work_mode: str | None = None
    salary: str | None = None
    deal_breakers: list[str] = Field(default_factory=list)
    career_goal: str | None = None
    superpower: str | None = None


class MentorConverseResponse(BaseModel):
    reply: str
    # Present only on surfaces with a typed accept path. `null` everywhere else,
    # so a client never has to guess whether a proposal is actionable.
    proposed_diff: MentorFilterDiff | None = None


@router.post("/converse", response_model=MentorConverseResponse)
async def converse(
    body: MentorConverseRequest,
    background_tasks: BackgroundTasks,
    principal: Principal = Depends(get_principal),
    provider: LLMProvider = Depends(get_interactive_provider),
) -> MentorConverseResponse:
    db = get_supabase_admin()
    messages = [m.model_dump() for m in body.messages]
    turn_text = mentor.last_user_turn(messages)

    turn = await mentor.converse(db, principal.id, body.surface, messages, provider)

    if turn_text:
        # Best-effort, both off the reply. The query log feeds the batch
        # distiller; the learner takes what this turn says about them now.
        SearchQueriesRepository(db).log(
            surface=f"mentor:{body.surface}", query=turn_text, user_id=principal.id
        )
        background_tasks.add_task(
            mentor_learn.learn_from_turn, principal.id, turn_text, body.surface
        )

    return MentorConverseResponse(
        reply=turn.reply,
        proposed_diff=MentorFilterDiff(**turn.proposals) if turn.proposals else None,
    )
