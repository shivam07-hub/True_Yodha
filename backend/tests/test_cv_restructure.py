"""Unit tests for whole-CV Restructure (cv_restructure).

Pure logic + a fake provider — no real LLM. Covers the prompt guards, the
defensive JSON parse, and the proposal/error branches. The keep-charge ordering
lives in the router and is covered by the route-level behaviour (charge before
write, refund on write failure) — here we pin the stateless proposal engine.
"""
import asyncio
import json

from app.services import cv_restructure


class _FakeProvider:
    def __init__(self, reply: str | None = None, raise_error: bool = False):
        self._reply = reply
        self._raise = raise_error
        self.calls: list[dict] = []

    async def complete(self, messages, max_tokens=None):  # noqa: ANN001
        self.calls.append({"messages": messages, "max_tokens": max_tokens})
        if self._raise:
            from app.services.llm_provider import LLMProviderError
            raise LLMProviderError("all providers down")
        return self._reply


def test_build_messages_enforces_no_fabrication_and_no_section_removal():
    msgs = cv_restructure._build_messages(
        "Jane Doe\nExperience\n- Did things",
        role="Senior PM",
        company="Acme",
        missing_keywords=["SQL", "A/B testing"],
    )
    system = msgs[0]["content"].lower()
    user = msgs[-1]["content"]
    # No-fabrication
    assert "must not" in system and "invent" in system
    # Structure preservation — never drop employers/dates/sections, only bullets
    assert "remove any employer" in system or "whole section" in system
    assert "only individual experience/project bullets" in system
    # Personal context threaded through
    assert "Senior PM" in user
    assert "Acme" in user
    assert "SQL" in user


def test_parse_proposal_reads_valid_json():
    raw = json.dumps({
        "cv": "Jane Doe\nExperience\n- Stronger bullet",
        "changes": ["Moved Acme above the internship", "Merged two deploy bullets"],
        "why": "Most relevant role first.",
        "playbook": "Most-relevant-first",
        "uncertainty": "Verify the 40% figure is real.",
    })
    out = cv_restructure._parse_proposal(raw)
    assert out is not None
    assert out["cv"].startswith("Jane Doe")
    assert len(out["changes"]) == 2
    assert out["why"]


def test_parse_proposal_strips_code_fence():
    raw = "```json\n" + json.dumps({"cv": "ABC", "changes": []}) + "\n```"
    out = cv_restructure._parse_proposal(raw)
    assert out is not None
    assert out["cv"] == "ABC"


def test_parse_proposal_rejects_bad_json_and_empty_cv():
    assert cv_restructure._parse_proposal("not json at all") is None
    assert cv_restructure._parse_proposal(json.dumps({"cv": "   ", "changes": []})) is None
    assert cv_restructure._parse_proposal(json.dumps(["wrong", "shape"])) is None


def test_suggest_restructure_returns_proposal():
    reply = json.dumps({
        "cv": "Jane Doe\nExperience\n- Led 0→1 launch",
        "changes": ["Reordered for the JD"],
        "why": "Leads with the most relevant proof.",
        "playbook": "XYZ impact bullets",
        "uncertainty": "",
    })
    provider = _FakeProvider(reply=reply)
    out = asyncio.run(cv_restructure.suggest_restructure(
        "Jane Doe\nExperience\n- did a launch",
        role="PM", company="Acme", missing_keywords=["SQL"], provider=provider,
    ))
    assert out["mode"] == "proposal"
    assert out["proposed_text"].startswith("Jane Doe")
    assert out["changes"] == ["Reordered for the JD"]
    assert provider.calls and provider.calls[0]["max_tokens"] == cv_restructure._MAX_TOKENS


def test_suggest_restructure_errors_without_provider():
    out = asyncio.run(cv_restructure.suggest_restructure(
        "some cv", role=None, company=None, missing_keywords=[], provider=None,
    ))
    assert out["mode"] == "error"


def test_suggest_restructure_errors_on_empty_cv():
    out = asyncio.run(cv_restructure.suggest_restructure(
        "   ", role=None, company=None, missing_keywords=[], provider=_FakeProvider("{}"),
    ))
    assert out["mode"] == "error"


def test_suggest_restructure_errors_on_provider_failure():
    out = asyncio.run(cv_restructure.suggest_restructure(
        "real cv text", role=None, company=None, missing_keywords=[],
        provider=_FakeProvider(raise_error=True),
    ))
    assert out["mode"] == "error"


def test_suggest_restructure_errors_on_unparseable_reply():
    out = asyncio.run(cv_restructure.suggest_restructure(
        "real cv text", role=None, company=None, missing_keywords=[],
        provider=_FakeProvider(reply="sorry, here is your cv: ..."),
    ))
    assert out["mode"] == "error"
