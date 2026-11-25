"""Who an AI call is for, and so whether OpenRouter may bill it.

OpenRouter is the one paid model account. It pays only for AI a person on Myro
asked for: a signed-in user who is not one of Myro's own test accounts, or a
visitor on a public page (Shivam, 2026-11-25). Everything else takes the free
lanes or a model we run ourselves: corpus passes, content scripts, evals, QA on
test accounts, a laptop's dev run.

Until then one key served prod and every laptop `.env` alike, so OpenRouter's
bill could not tell a user's tailor from a session's script run.

The mark rides a context variable, set where a call learns whose it is:
  * `deps.get_current_user` — every signed-in request;
  * `bill_visitor` — the `/public` router's own dependency;
  * `background.dispatch._invoke` — a job's payload `user_id`;
  * a sweep that finishes one user's work, per user (`billed_to`).
Nothing marked means nobody asked, so nothing is billed. The provider ladder
and the embedding client both ask `openrouter_allowed()` at call time.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

VISITOR = "visitor"
#: The one named exception. The mentor playbook's vectors must come from the
#: same model users' searches are embedded with, and only OpenRouter serves it.
PLAYBOOK_PUBLISH = "playbook_publish"

_spender: ContextVar[str | None] = ContextVar("llm_spender", default=None)


def bill_user(user_id: str | None) -> None:
    """Mark the rest of this context as work for `user_id` (None: for nobody)."""
    _spender.set(user_id or None)


async def bill_visitor() -> None:
    """FastAPI dependency for public pages.

    Async on purpose: FastAPI awaits an async dependency in the request's own
    context, so the mark reaches the endpoint. A sync one runs in a worker
    thread's copy of the context, and the mark would vanish with the thread.
    """
    _spender.set(VISITOR)


def bill_playbook_publish() -> None:
    _spender.set(PLAYBOOK_PUBLISH)


@contextmanager
def billed_to(user_id: str | None) -> Iterator[None]:
    """Work for one user inside a larger context (a job, a sweep's loop)."""
    token = _spender.set(user_id or None)
    try:
        yield
    finally:
        _spender.reset(token)


def test_account_ids() -> frozenset[str]:
    from app.database import get_supabase_admin
    from app.services import test_accounts

    return test_accounts.excluded_user_ids(get_supabase_admin())


def openrouter_allowed() -> bool:
    spender = _spender.get()
    if spender in (VISITOR, PLAYBOOK_PUBLISH):
        return True
    if not spender:
        return False
    return spender not in test_account_ids()
