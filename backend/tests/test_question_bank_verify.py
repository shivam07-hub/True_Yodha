"""The gate that decides what a user is scored against."""

from __future__ import annotations

import json

import pytest

from app.services.learning_ladder_prompts import TargetSkill
from app.services.llm_provider import LLMProviderError
from app.services.question_bank_verify import (
    batches,
    malformed_ids,
    verify_batch,
)

SKILL = TargetSkill(id=7, display_name="Machine Learning", l1_domain="Tech", l2_cluster="ML")


def _row(row_id: int, correct: int = 1, **over) -> dict:
    base = {
        "id": row_id,
        "question_text": f"Question {row_id}?",
        "options": ["a", "b", "c", "d"],
        "correct_index": correct,
        "explanation": "Because b.",
    }
    base.update(over)
    return base


class _Provider:
    def __init__(self, raw: str | None = None, raises: bool = False) -> None:
        self._raw = raw
        self._raises = raises
        self.calls = 0

    async def complete(self, messages, max_tokens: int = 4096) -> str:
        self.calls += 1
        if self._raises:
            raise LLMProviderError("provider down")
        return self._raw or ""


def _verdicts(*pairs: tuple[int, bool]) -> str:
    return json.dumps({
        "verdicts": [
            {"index": i, "agrees": agrees, "correct_index": 1 if agrees else 3}
            for i, agrees in pairs
        ]
    })


@pytest.mark.asyncio
async def test_agreement_stamps_and_disagreement_retires():
    rows = [_row(1), _row(2), _row(3)]
    provider = _Provider(_verdicts((0, True), (1, False), (2, True)))

    out = await verify_batch(provider, SKILL, 1, rows)

    assert out.agreed_ids == [1, 3]
    assert out.retired_ids == [2]
    assert out.inconclusive is False


@pytest.mark.asyncio
async def test_a_contested_answer_key_is_retired_not_repointed():
    """The verifier offers a corrected index. We do not take it.

    Two models disagreeing about which answer is right is not a vote one of them
    wins — it is a question that should not be scored against someone's career.
    """
    rows = [_row(1, correct=1)]
    provider = _Provider(_verdicts((0, False)))

    out = await verify_batch(provider, SKILL, 1, rows)

    assert out.retired_ids == [1]
    assert out.agreed_ids == []


@pytest.mark.asyncio
async def test_provider_failure_is_inconclusive_and_touches_nothing():
    """An unreadable verifier is not evidence about the questions.

    The dangerous failure here would be treating provider downtime as
    disagreement and retiring a healthy bank.
    """
    rows = [_row(1), _row(2)]
    out = await verify_batch(_Provider(raises=True), SKILL, 1, rows)

    assert out.inconclusive is True
    assert out.agreed_ids == [] and out.retired_ids == []


@pytest.mark.asyncio
async def test_unparseable_verdicts_are_inconclusive_not_agreement():
    out = await verify_batch(_Provider("not json at all"), SKILL, 1, [_row(1)])

    assert out.inconclusive is True
    assert out.agreed_ids == []


@pytest.mark.asyncio
async def test_a_row_with_no_verdict_is_not_stamped():
    """Silence is not agreement. A verifier that answers about two of three
    questions leaves the third exactly where it was — unverified, unservable."""
    rows = [_row(1), _row(2), _row(3)]
    provider = _Provider(_verdicts((0, True), (1, True)))

    out = await verify_batch(provider, SKILL, 1, rows)

    assert 3 not in out.agreed_ids


def test_malformed_rows_are_found_without_spending_a_call():
    rows = [
        _row(1),
        _row(2, options=[]),
        _row(3, correct=9),              # answer key out of range
        _row(4, explanation="  "),       # no explanation → can never serve
        _row(5, question_text=""),
    ]
    assert malformed_ids(rows) == [2, 3, 4, 5]


@pytest.mark.asyncio
async def test_verify_batch_refuses_malformed_rows_rather_than_misaligning():
    """Index alignment is the whole contract: verdicts come back keyed by
    position, so a dropped row would stamp its neighbour's verdict."""
    with pytest.raises(ValueError):
        await verify_batch(_Provider(_verdicts((0, True))), SKILL, 1, [_row(1, options=[])])


def test_batches_are_whole_and_lossless():
    rows = [_row(i) for i in range(25)]
    chunks = batches(rows, size=10)
    assert [len(c) for c in chunks] == [10, 10, 5]
    assert sum(len(c) for c in chunks) == 25
