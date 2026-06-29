"""cv_intake — shape the user's own experience into JD-aligned bullets.

Covers the JSON coercion (fences, junk, out-of-range indices, skill filtering,
cap) and the draft_from_intake guards (empty input, no provider, provider error).
"""
import pytest

from app.services import cv_intake
from app.services.llm_provider import LLMProviderError


def test_coerce_parses_validates_and_filters() -> None:
    raw = (
        '[{"text":"Led a 4-person GTM team to launch X","skills_covered":["Enterprise Architecture","Bogus Skill"],'
        '"role_index":1,"needs_metric":false},'
        '{"text":"Cut costs","skills_covered":[],"role_index":9,"needs_metric":true}]'
    )
    out = cv_intake._coerce_bullets(raw, ["Enterprise Architecture", "Strategy"], role_count=2)
    assert len(out) == 2
    # unknown skill dropped, known kept
    assert out[0]["skills_covered"] == ["Enterprise Architecture"]
    assert out[0]["role_index"] == 1
    # out-of-range index → None; needs_metric preserved
    assert out[1]["role_index"] is None
    assert out[1]["needs_metric"] is True


def test_coerce_strips_code_fences() -> None:
    raw = '```json\n[{"text":"Owned the roadmap","skills_covered":[],"role_index":null,"needs_metric":false}]\n```'
    out = cv_intake._coerce_bullets(raw, [], role_count=1)
    assert len(out) == 1 and out[0]["text"] == "Owned the roadmap"


def test_coerce_junk_returns_empty() -> None:
    assert cv_intake._coerce_bullets("I cannot help with that.", [], 1) == []
    assert cv_intake._coerce_bullets("", [], 1) == []


def test_coerce_caps_at_max() -> None:
    items = ",".join('{"text":"Bullet %d","skills_covered":[],"role_index":null,"needs_metric":false}' % i for i in range(20))
    out = cv_intake._coerce_bullets(f"[{items}]", [], 0)
    assert len(out) == cv_intake.MAX_BULLETS


class _Provider:
    def __init__(self, reply: str | None = None, boom: bool = False) -> None:
        self._reply = reply
        self._boom = boom

    async def complete(self, messages, max_tokens=0):  # noqa: ANN001
        if self._boom:
            raise LLMProviderError("down")
        return self._reply


@pytest.mark.asyncio
async def test_draft_empty_input_errors() -> None:
    res = await cv_intake.draft_from_intake("   ", None, [], [], _Provider("[]"))
    assert res["mode"] == "error"


@pytest.mark.asyncio
async def test_draft_no_provider_errors() -> None:
    res = await cv_intake.draft_from_intake("did things", None, [], [], None)
    assert res["mode"] == "error"


@pytest.mark.asyncio
async def test_draft_provider_failure_errors() -> None:
    res = await cv_intake.draft_from_intake("did things", None, [], [], _Provider(boom=True))
    assert res["mode"] == "error"


@pytest.mark.asyncio
async def test_draft_happy_path() -> None:
    reply = '[{"text":"Drove €500K B2B revenue","skills_covered":["Sales"],"role_index":0,"needs_metric":false}]'
    res = await cv_intake.draft_from_intake(
        "I drove 500k in B2B revenue", "JD wants sales", ["Sales"], ["GTM Manager · Capgemini"], _Provider(reply),
    )
    assert res["mode"] == "draft"
    assert res["bullets"][0]["skills_covered"] == ["Sales"]
    assert res["bullets"][0]["role_index"] == 0
