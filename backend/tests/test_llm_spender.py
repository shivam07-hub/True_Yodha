"""OpenRouter bills only for a person on Myro (Shivam, 2026-11-25).

A signed-in user who is not one of Myro's own test accounts, or a visitor on a
public page. Corpus passes, content scripts, test accounts and a laptop's dev
run all take the free lanes instead. One named exception: publishing the
mentor playbook, whose vectors must match the ones users' searches make.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest

from app.services import llm_spender
from app.services.llm_provider import LLMProvider

_REAL = "11111111-1111-1111-1111-111111111111"
_TEST = "22222222-2222-2222-2222-222222222222"


@pytest.fixture(autouse=True)
def _known_test_accounts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm_spender, "test_account_ids", lambda: frozenset({_TEST}))


class _Client:
    """The two halves of `AsyncOpenAI` the provider loop touches."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.calls = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> Any:
        self.calls += 1
        if kwargs.get("stream"):
            return self._stream()
        message = SimpleNamespace(content=f"from {self.base_url}")
        return SimpleNamespace(choices=[SimpleNamespace(message=message)], model=kwargs["model"])

    async def _stream(self) -> Any:
        delta = SimpleNamespace(content=f"from {self.base_url}")
        yield SimpleNamespace(choices=[SimpleNamespace(delta=delta)])


def _ladder() -> tuple[_Client, _Client, LLMProvider]:
    openrouter = _Client("https://openrouter.ai/api/v1/")
    groq = _Client("https://api.groq.com/openai/v1/")
    return openrouter, groq, LLMProvider([(openrouter, "or-model", None), (groq, "groq-model", None)])


def _complete_as(spender: Any) -> tuple[_Client, _Client]:
    openrouter, groq, provider = _ladder()

    async def run() -> None:
        spender()
        await provider.complete([{"role": "user", "content": "hi"}])

    asyncio.run(run())
    return openrouter, groq


def test_work_for_nobody_never_reaches_openrouter() -> None:
    openrouter, groq = _complete_as(lambda: None)
    assert (openrouter.calls, groq.calls) == (0, 1)


def test_a_real_user_is_billed_to_openrouter() -> None:
    openrouter, groq = _complete_as(lambda: llm_spender.bill_user(_REAL))
    assert (openrouter.calls, groq.calls) == (1, 0)


def test_a_test_account_runs_on_the_free_lane() -> None:
    openrouter, groq = _complete_as(lambda: llm_spender.bill_user(_TEST))
    assert (openrouter.calls, groq.calls) == (0, 1)


def test_a_visitor_on_a_public_page_is_billed() -> None:
    """`bill_visitor` is a FastAPI dependency: awaited in the request's own task."""
    openrouter, groq, provider = _ladder()

    async def run() -> None:
        await llm_spender.bill_visitor()
        await provider.complete([{"role": "user", "content": "hi"}])

    asyncio.run(run())
    assert (openrouter.calls, groq.calls) == (1, 0)


def test_streaming_follows_the_same_rule() -> None:
    openrouter, groq, provider = _ladder()

    async def run() -> str:
        return "".join([chunk async for chunk in provider.stream_complete([{"role": "user", "content": "hi"}])])

    assert "groq" in asyncio.run(run())
    assert openrouter.calls == 0


def test_embeddings_refuse_work_for_nobody(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import embeddings

    monkeypatch.setattr(embeddings.settings, "openrouter_api_key", "sk-test")
    monkeypatch.setattr(embeddings, "_client", None)

    with pytest.raises(embeddings.EmbeddingError):
        asyncio.run(embeddings.embed_texts(["a story"]))
    assert embeddings._client is None


def test_a_background_job_is_billed_to_the_user_in_its_payload() -> None:
    from app.services.background import dispatch

    seen: dict[str, bool] = {}

    async def handler(payload: dict[str, Any], allow_retry: bool) -> None:  # noqa: ARG001
        seen[payload.get("user_id") or "system"] = llm_spender.openrouter_allowed()

    dispatch._HANDLERS["spender_probe"] = handler
    try:
        for payload in ({"user_id": _REAL}, {"user_id": _TEST}, {"run_id": "r1"}):
            asyncio.run(dispatch._invoke("spender_probe", payload, allow_retry=False))
    finally:
        dispatch._HANDLERS.pop("spender_probe")

    assert seen == {_REAL: True, _TEST: False, "system": False}


def test_signing_in_bills_the_signed_in_user(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.security import HTTPAuthorizationCredentials

    from app import deps

    monkeypatch.setattr(
        deps, "_decode_local_jwt",
        lambda token: SimpleNamespace(id=_REAL, email="a@b.c", full_name=None),
    )
    monkeypatch.setattr(deps, "_ensure_profile_provisioned", lambda *a: None)

    async def run() -> bool:
        await deps.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="t"))
        return llm_spender.openrouter_allowed()

    assert asyncio.run(run()) is True


def test_every_public_page_bills_a_visitor() -> None:
    from app.routers import public

    assert llm_spender.bill_visitor in [d.dependency for d in public.router.dependencies]


def test_publishing_the_playbook_is_the_one_named_exception() -> None:
    async def run() -> bool:
        llm_spender.bill_playbook_publish()
        return llm_spender.openrouter_allowed()

    assert asyncio.run(run()) is True
