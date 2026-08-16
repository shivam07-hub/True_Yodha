"""mentor — the one call for "Myro talking to a user and learning from it".

MYRO_MENTOR's seam, and slice 4. Everything that speaks routes through here.

    converse(user_id, surface, messages) -> MentorTurn
    MentorTurn = { reply, proposals, learned }

WHY THIS EXISTS RATHER THAN A SECOND CHAT ROUTE

`/jobs/intent-chat` works, and it is shaped like the one thing it does: it
returns a filter diff. That shape is why the CV screen has never been able to
have a Myro on it — the endpoint could only ever help with a search. Widening it
in place would have made "job intent" the name of the general case forever.

WHAT "ONE THREAD" TURNED OUT TO MEAN (grilled 2026-08-15)

Not a transcript. Facts and stories already cross sessions through semantic
recall — what did NOT travel was that each surface retrieved its own subset, in
its own order, into its own prompt. So the thread is the CONTEXT, assembled once
here and identical everywhere, and the alternative was a new table holding
someone's career anxieties verbatim, with retention and deletion to match, to
buy a quoting ability that recall already approximates.

The consequence to hold: Myro knows what you told it, not what it said back. It
can say "you led the payments migration"; it cannot say "as I mentioned on
Tuesday". That is a deliberate trade, not a gap to fix later without deciding
again.

PROPOSALS ARE TYPED PER SURFACE, AND MOST SURFACES HAVE NONE

`job_intent` proposes a `FilterDiff`. `cv`, `skills` and `prep` propose nothing
this slice: they talk, and slice 3's learner takes facts from the turn. A
surface that could propose targeting from anywhere sounds like the singular
platform and is the exact failure lock 5 forbids — targeting re-ranks a market
whose verdicts cache permanently, so it moves only when the user means it to.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.llm_provider import LLMProvider

logger = logging.getLogger(__name__)

Surface = Literal["cv", "skills", "job_intent", "prep"]

# Only this surface has a typed proposal today. Named as a set rather than an
# `if surface == …` so adding one is a decision made in one visible place.
_PROPOSING_SURFACES: frozenset[str] = frozenset({"job_intent"})

_RECALL_FACTS = 5
_RECALL_STORIES = 3


@dataclass(frozen=True)
class MentorTurn:
    reply: str
    proposals: dict[str, Any] | None = None
    learned: list[dict[str, str]] = field(default_factory=list)


async def context(db: Any, user_id: str, turn_text: str) -> dict[str, Any]:
    """What Myro knows, assembled once, identical on every surface.

    The profile columns plus the facts and stories nearest THIS turn. Every
    retrieval here is fail-soft by construction — a memory outage degrades the
    reply, it never fails the turn, because the user is mid-conversation and a
    thinner answer beats an error.
    """
    from app.repositories.users import UsersRepository
    from app.services import memory_recall, memory_semantic

    profile = UsersRepository(db).get_profile(user_id) or {}

    try:
        hits = await memory_semantic.retrieve(user_id, turn_text, k=_RECALL_FACTS)
        if hits:
            profile["known_facts"] = [h.text for h in hits]
    except Exception as exc:  # noqa: BLE001 — recall is enrichment, never the turn
        logger.info("mentor.context: fact recall unavailable reason=%s", exc.__class__.__name__)

    try:
        story_hits = await memory_recall.recall_stories(user_id, turn_text, k=_RECALL_STORIES)
        if story_hits:
            profile["known_stories"] = [
                " — ".join(p for p in (h.title, h.result) if p) for h in story_hits
            ]
    except Exception as exc:  # noqa: BLE001
        logger.info("mentor.context: story recall unavailable reason=%s", exc.__class__.__name__)

    return profile


def last_user_turn(messages: list[dict[str, str]]) -> str:
    """The turn Myro is answering — what recall is aimed at and what the learner
    reads. Empty string when a caller sends only assistant turns, which retrieval
    treats as "no query" rather than erroring."""
    return next((m.get("content") or "" for m in reversed(messages) if m.get("role") == "user"), "")


async def converse(
    db: Any,
    user_id: str,
    surface: str,
    messages: list[dict[str, str]],
    provider: LLMProvider,
    *,
    extract: bool = False,
) -> MentorTurn:
    """One turn, on any surface. Proposals only where the surface has a typed one.

    Does NOT write. Learning is scheduled by the caller off the response path —
    the user is waiting on this reply, and a fact is not worth a slower answer.

    `extract=True` is the pre-flight after they have already said what they want:
    named claims become proposal rows, the reply is never a question. The feed's
    intent chat leaves this off — it still interviews.
    """
    from app.services import intent_chat_service

    turn_text = last_user_turn(messages)
    profile = await context(db, user_id, turn_text)

    result = await intent_chat_service.converse(
        profile, messages, provider, mode="extract" if extract else "interview",
    )
    reply = result.get("reply") or ""

    # A model that proposes on a surface with no accept path would put a change
    # on screen the user cannot action. Drop it rather than render a dead button.
    diff = result.get("proposed_diff") if surface in _PROPOSING_SURFACES else None
    if result.get("proposed_diff") and surface not in _PROPOSING_SURFACES:
        logger.info("metric mentor.proposal_dropped surface=%s", surface)

    return MentorTurn(reply=reply, proposals=diff or None)


__all__ = ["MentorTurn", "Surface", "context", "converse", "last_user_turn"]
