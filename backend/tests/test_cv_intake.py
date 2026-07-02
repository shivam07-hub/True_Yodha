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
        self.seen_messages: list[dict] | None = None

    async def complete(self, messages, max_tokens=0):  # noqa: ANN001
        self.seen_messages = messages
        if self._boom:
            raise LLMProviderError("down")
        return self._reply


def test_build_messages_sends_full_story_untruncated() -> None:
    # The detail-loss bug (Entry 3.6): the user writes a long, specific story and
    # gets bland stubs back. Root guard: the user's OWN words must reach the model
    # in full — never silently truncated the way the JD is. A specific fact buried
    # deep in a 5k-char brain-dump must still be visible to Mentor.
    marker = "Manfest Varchasva — biggest business fest in Asia at IIM Lucknow"
    story = ("I did many things. " * 400) + marker
    assert len(story) > 4000
    msgs = cv_intake._build_messages(story, jd_text=None, gap_skills=[], roles=[])
    user_msg = next(m["content"] for m in msgs if m["role"] == "user")
    assert marker in user_msg


def test_guardrails_require_preserving_specifics() -> None:
    # The prompt must actively demand the concrete specifics the candidate stated
    # (named orgs, scope, scale) — a bullet reduced to "Handled marketing for X"
    # is the failure mode. Lock the anti-blandness directive into the contract.
    g = cv_intake._GUARDRAILS.lower()
    assert "specific" in g
    assert "vague" in g or "generic" in g


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
async def test_place_metric_weaves_user_number_into_bullet() -> None:
    # 4.1: Myro never invents a number, but when the USER supplies one it must
    # fold it into the bullet grammatically — closing the honesty loop.
    reply = "Grew Finalatics revenue from ₹10L to ₹2Cr as the primary growth lead."
    p = _Provider(reply)
    res = await cv_intake.place_metric("Helped Finalatics grow revenue", "from ₹10L to ₹2Cr", p)
    assert res["mode"] == "placed"
    assert "₹2Cr" in res["text"]
    # the user's number was actually handed to the model
    user_msg = next(m["content"] for m in p.seen_messages if m["role"] == "user")
    assert "₹2Cr" in user_msg


@pytest.mark.asyncio
async def test_place_metric_empty_inputs_return_original() -> None:
    # No number / no bullet / no provider → never fabricate, just hand back the
    # bullet unchanged so the caller can Add it as-is.
    for bullet, metric, prov in [
        ("A bullet", "  ", _Provider("x")),
        ("  ", "50%", _Provider("x")),
        ("A bullet", "50%", None),
    ]:
        res = await cv_intake.place_metric(bullet, metric, prov)
        assert res["mode"] == "unchanged"
        assert res["text"] == bullet.strip()


@pytest.mark.asyncio
async def test_place_metric_strips_fences_and_quotes() -> None:
    p = _Provider('```\n"Cut costs by 20% across the portfolio."\n```')
    res = await cv_intake.place_metric("Cut costs across the portfolio", "20%", p)
    assert res["text"] == "Cut costs by 20% across the portfolio."


@pytest.mark.asyncio
async def test_draft_happy_path() -> None:
    reply = '[{"text":"Drove €500K B2B revenue","skills_covered":["Sales"],"role_index":0,"needs_metric":false}]'
    res = await cv_intake.draft_from_intake(
        "I drove 500k in B2B revenue", "JD wants sales", ["Sales"], ["GTM Manager · Capgemini"], _Provider(reply),
    )
    assert res["mode"] == "draft"
    assert res["bullets"][0]["skills_covered"] == ["Sales"]
    assert res["bullets"][0]["role_index"] == 0
