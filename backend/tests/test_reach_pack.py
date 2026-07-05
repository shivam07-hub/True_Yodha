"""Reach Pack service — grounded, no-fabrication outreach draft, parse-safe."""
from __future__ import annotations

import json

import pytest

from app.services import reach_pack


class _StubProvider:
    def __init__(self, reply: str):
        self._reply = reply
        self.messages: list[dict] | None = None

    async def complete(self, messages, max_tokens=900, temperature=None):
        self.messages = messages
        return self._reply


_CV = {
    "contact": {"name": "Deveshwar Kashyap"},
    "summary": "Marketing manager scaling digital products.",
    "experience": [
        {
            "role": "Manager - Subscriber Marketing",
            "company": "Tata Play",
            "dates": "2025-",
            "bullets": ["Drove ₹30Cr ARR across 11 products"],
        }
    ],
    "skills_line": "GTM Strategy, Lifecycle Marketing",
}

_GOOD_REPLY = json.dumps(
    {
        "outreach_message": "Hi {first name}, I lead subscriber marketing at Tata Play and admire Netscribes' data work — would love to connect.",
        "referral_ask": "Once connected, I'll ask if they'd refer me for the Presales role.",
        "timing": "Send the connect note now; follow up 2 days after they accept.",
        "warm_intro": "",
    }
)


@pytest.mark.asyncio
async def test_build_reach_pack_parses_and_grounds_in_cv():
    provider = _StubProvider(_GOOD_REPLY)
    pack = await reach_pack.build_reach_pack(
        cv_structured=_CV,
        body_text="",
        role="Manager - Presales",
        company="Netscribes",
        target_titles=["VP Presales", "Director Presales"],
        warm_connection=None,
        provider=provider,
    )
    assert pack is not None
    assert "{first name}" in pack["outreach_message"]  # placeholder, no invented name
    assert pack["referral_ask"]
    # The CV digest reached the model (grounding), and the target company too.
    ctx = provider.messages[1]["content"]
    assert "Tata Play" in ctx
    assert "Netscribes" in ctx
    assert "VP Presales" in ctx


@pytest.mark.asyncio
async def test_warm_connection_flows_into_prompt():
    provider = _StubProvider(_GOOD_REPLY)
    await reach_pack.build_reach_pack(
        cv_structured=_CV,
        body_text="",
        role="Manager",
        company="Netscribes",
        target_titles=["VP"],
        warm_connection="Asha Rao — Director, Analytics",
        provider=provider,
    )
    assert "Asha Rao" in provider.messages[1]["content"]


@pytest.mark.asyncio
async def test_none_provider_returns_none():
    assert await reach_pack.build_reach_pack(
        cv_structured=_CV, body_text="", role="x", company="y",
        target_titles=[], warm_connection=None, provider=None,
    ) is None


@pytest.mark.asyncio
async def test_unparseable_reply_returns_none():
    provider = _StubProvider("sorry, I cannot help with that")
    pack = await reach_pack.build_reach_pack(
        cv_structured=_CV, body_text="", role="x", company="y",
        target_titles=[], warm_connection=None, provider=provider,
    )
    assert pack is None


@pytest.mark.asyncio
async def test_empty_outreach_rejected():
    provider = _StubProvider(json.dumps({"outreach_message": "  ", "referral_ask": "x"}))
    pack = await reach_pack.build_reach_pack(
        cv_structured=_CV, body_text="", role="x", company="y",
        target_titles=[], warm_connection=None, provider=provider,
    )
    assert pack is None


def test_cv_digest_falls_back_to_body_text():
    digest = reach_pack._cv_digest({}, "Raw CV text here with experience.")
    assert "Raw CV text" in digest
