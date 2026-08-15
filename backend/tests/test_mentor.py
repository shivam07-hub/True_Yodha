"""The mentor seam — one Myro, whichever screen you are on.

Slice 4. The load-bearing behaviours are the two that decide whether "one
surface" is safe rather than just tidy:

- a proposal may only reach a surface that can accept it, or the user is shown a
  change with no button;
- context assembly is fail-soft in every direction, because the user is
  mid-conversation and a thinner reply beats an error.

The third is deploy safety: `/jobs/intent-chat` is live and must keep behaving
exactly as it did while the frontend moves across.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import mentor


class _Provider:
    async def complete(self, _messages, **_kw) -> str:
        return ""


class _Users:
    def __init__(self, profile: dict[str, Any] | None = None) -> None:
        self._profile = profile if profile is not None else {"target_role_title": "PM"}

    def get_profile(self, _user_id: str) -> dict[str, Any]:
        return dict(self._profile)


def _patch(monkeypatch, *, facts=None, stories=None, converse_result=None, fact_exc=None, story_exc=None):
    from app.repositories import users as users_repo_mod
    from app.services import intent_chat_service, memory_recall, memory_semantic

    monkeypatch.setattr(users_repo_mod, "UsersRepository", lambda _db: _Users())

    async def _retrieve(*_a, **_k):
        if fact_exc:
            raise fact_exc
        return facts or []

    async def _recall(*_a, **_k):
        if story_exc:
            raise story_exc
        return stories or []

    async def _converse(_profile, _messages, _provider):
        return converse_result if converse_result is not None else {"reply": "ok"}

    monkeypatch.setattr(memory_semantic, "retrieve", _retrieve)
    monkeypatch.setattr(memory_recall, "recall_stories", _recall)
    monkeypatch.setattr(intent_chat_service, "converse", _converse)


def test_the_turn_myro_answers_is_the_last_user_message() -> None:
    messages = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "a reply"},
        {"role": "user", "content": "the one that matters"},
    ]
    assert mentor.last_user_turn(messages) == "the one that matters"


def test_an_assistant_only_thread_is_not_an_error() -> None:
    """Retrieval treats "" as no query. Raising here would fail a turn over a
    client quirk."""
    assert mentor.last_user_turn([{"role": "assistant", "content": "hello"}]) == ""


@pytest.mark.parametrize("surface", ["cv", "skills", "prep"])
def test_a_proposal_never_reaches_a_surface_that_cannot_accept_it(monkeypatch, surface: str) -> None:
    """The model may propose anywhere; only `job_intent` has an accept path. A
    diff rendered on the CV screen is a change the user cannot action — and one
    that silently re-ranks a market whose verdicts cache permanently if it ever
    did get applied."""
    _patch(monkeypatch, converse_result={
        "reply": "noted", "proposed_diff": {"add_roles": ["Data Engineer"]},
    })
    turn = asyncio.run(mentor.converse(object(), "u1", surface, [{"role": "user", "content": "hi"}], _Provider()))
    assert turn.reply == "noted"
    assert turn.proposals is None


def test_job_intent_still_gets_its_diff(monkeypatch) -> None:
    _patch(monkeypatch, converse_result={
        "reply": "how about this", "proposed_diff": {"add_roles": ["Data Engineer"]},
    })
    turn = asyncio.run(mentor.converse(object(), "u1", "job_intent", [{"role": "user", "content": "hi"}], _Provider()))
    assert turn.proposals == {"add_roles": ["Data Engineer"]}


def test_context_carries_facts_and_stories_under_the_keys_the_prompt_reads(monkeypatch) -> None:
    """`known_facts` / `known_stories` are the keys the Career-Ops prompt and the
    ranker already consume. A new key here would be a store nothing reads."""
    fact = type("F", (), {"text": "Avoids managing people"})()
    story = type("S", (), {"title": "Payments migration", "result": "40 people"})()
    _patch(monkeypatch, facts=[fact], stories=[story])

    profile = asyncio.run(mentor.context(object(), "u1", "tell me about leadership"))
    assert profile["known_facts"] == ["Avoids managing people"]
    assert profile["known_stories"] == ["Payments migration — 40 people"]


def test_a_memory_outage_thins_the_reply_it_does_not_fail_the_turn(monkeypatch) -> None:
    _patch(monkeypatch, fact_exc=RuntimeError("pgvector down"), story_exc=RuntimeError("down"))
    profile = asyncio.run(mentor.context(object(), "u1", "anything"))
    assert "known_facts" not in profile
    assert "known_stories" not in profile
    assert profile["target_role_title"] == "PM"  # the profile still arrived


def test_converse_writes_nothing(monkeypatch) -> None:
    """Learning is scheduled by the router off the response path. If the seam
    itself wrote, every reply would pay for it and Discard would stop meaning
    discard on the surfaces that have one."""
    import ast
    import inspect

    tree = ast.parse(inspect.getsource(mentor))
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if node.body and isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant):
                if isinstance(node.body[0].value.value, str):
                    node.body.pop(0)
    src = ast.unparse(tree)
    for forbidden in ("update_profile", "insert(", ".add(", "learn_from_turn", "save_target"):
        assert forbidden not in src, f"mentor writes via {forbidden}"


def test_every_surface_in_the_seam_is_accepted_by_the_route() -> None:
    """The route's Literal and the seam's Surface must not drift — a surface the
    route accepts but the seam has never heard of would take the proposal path
    by omission."""
    import typing

    from app.routers.mentor import MentorConverseRequest

    route_surfaces = set(typing.get_args(MentorConverseRequest.model_fields["surface"].annotation))
    assert route_surfaces == set(typing.get_args(mentor.Surface))


def test_the_live_route_is_not_deleted_before_its_callers_move() -> None:
    """Expand-contract, the same rule a column gets. Dropping `cv_upload_jobs.score`
    before the code that read it had deployed broke production for four minutes
    this week; a route is no different."""
    from app.main import app

    paths = {r.path for r in app.routes}
    assert "/jobs/intent-chat" in paths
    assert "/mentor/converse" in paths
