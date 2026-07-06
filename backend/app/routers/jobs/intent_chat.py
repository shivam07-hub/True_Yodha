"""Delta-4 intent chat — /jobs/intent-chat[/apply].

The feed disappointed the user; instead of a dead end they talk to Myro, which
proposes a concrete filter change they one-tap confirm, then the feed re-runs.
The LLM only proposes; apply routes through the recompute-wired setters.
"""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.database import get_supabase_admin
from app.deps import Principal, get_principal
from app.repositories.search_queries import SearchQueriesRepository
from app.repositories.users import UsersRepository
from app.services import intent_chat_service, memory_semantic
from app.services.llm_provider import LLMProvider, get_interactive_provider

router = APIRouter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class IntentChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


class FilterDiff(BaseModel):
    add_roles: list[str] = Field(default_factory=list)
    remove_roles: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    seniority: str | None = None
    work_mode: str | None = None
    salary: str | None = None


class IntentChatResponse(BaseModel):
    reply: str
    proposed_diff: FilterDiff | None = None


@router.post("/intent-chat", response_model=IntentChatResponse)
async def intent_chat(
    body: IntentChatRequest,
    principal: Principal = Depends(get_principal),
    provider: LLMProvider = Depends(get_interactive_provider),
) -> IntentChatResponse:
    db = get_supabase_admin()
    profile = UsersRepository(db).get_profile(principal.id) or {}
    messages = [m.model_dump() for m in body.messages]

    # Log the latest user turn as intent (best-effort) — feeds distillation.
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), None)
    if last_user:
        SearchQueriesRepository(db).log(surface="intent_chat", query=last_user, user_id=principal.id)
        # Phase-4 "knows me": pull the memory facts most relevant to this turn so the
        # concierge answers with what Myro already knows. Fail-soft → no facts.
        hits = await memory_semantic.retrieve(principal.id, last_user, k=5)
        if hits:
            profile["known_facts"] = [h.text for h in hits]

    result = await intent_chat_service.converse(profile, messages, provider)
    diff = result.get("proposed_diff")
    return IntentChatResponse(
        reply=result["reply"],
        proposed_diff=FilterDiff(**diff) if diff else None,
    )


class ApplyDiffRequest(BaseModel):
    diff: FilterDiff


class ApplyDiffResponse(BaseModel):
    applied: bool
    changed: dict


@router.post("/intent-chat/apply", response_model=ApplyDiffResponse)
def apply_intent_diff(
    body: ApplyDiffRequest,
    principal: Principal = Depends(get_principal),
) -> ApplyDiffResponse:
    """Write a user-confirmed filter diff through the existing setters, then the
    client re-runs the feed. Never called without explicit confirmation."""
    changed = intent_chat_service.apply_diff(get_supabase_admin(), principal.id, body.diff.model_dump())
    return ApplyDiffResponse(applied=bool(changed), changed=changed)
