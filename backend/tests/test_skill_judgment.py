"""Stage B judgment — marking a closed list, never generating one."""

from __future__ import annotations

import asyncio

from app.services import skill_judgment
from app.services.skill_extraction import ExtractedSkill

CANDIDATES = [
    ExtractedSkill("Python (Programming Language)", "must_have", 4, 0.82),
    ExtractedSkill("Tableau (Business Intelligence Software)", "mentioned", 2, 0.68),
    ExtractedSkill("Leadership", "preferred", 2, 0.72),
]


class _Provider:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.max_tokens: int | None = None
        self.calls = 0

    async def complete(self, messages, max_tokens=4096, temperature=None):
        self.calls += 1
        self.max_tokens = max_tokens
        return self.reply


def _judge(reply: str, candidates=CANDIDATES):
    provider = _Provider(reply)
    verdicts = asyncio.run(
        skill_judgment.judge_skills("Data Engineer", "JD text", candidates, provider=provider)
    )
    return verdicts, provider


def test_the_prompt_carries_stage_a_evidence_as_a_prior() -> None:
    # The model corrects a reading rather than starting blank — a JD listing
    # Python under Requirements should not need a model to discover it.
    prompt = skill_judgment.build_judgment_prompt("Data Engineer", "JD", CANDIDATES)

    assert "1. Python (Programming Language) (named under a requirements heading)" in prompt
    assert "2. Tableau (Business Intelligence Software) (named in the body only)" in prompt
    assert "3. Leadership (named under a preferred/nice-to-have heading)" in prompt


def test_a_skill_that_was_never_offered_cannot_be_returned() -> None:
    # The point of the closed list: hallucination is structurally impossible,
    # not merely discouraged. This is why a small model is defensible here.
    verdicts, _ = _judge("1|required|4\n9|required|4\nKubernetes|required|3")

    assert [v.taxonomy_key for v in verdicts] == ["Python (Programming Language)"]


def test_verdicts_are_addressed_by_position_not_by_name() -> None:
    # A model that paraphrases or mangles a skill name cannot change WHICH
    # skill it is judging.
    verdicts, _ = _judge("1|required|3\n2|absent|0\n3|preferred|2")

    assert [(v.taxonomy_key, v.verdict, v.required_level) for v in verdicts] == [
        ("Python (Programming Language)", "required", 3),
        ("Tableau (Business Intelligence Software)", "absent", 0),
        ("Leadership", "preferred", 2),
    ]


def test_absent_is_dropped_rather_than_persisted() -> None:
    # A row saying "this job does not need Tableau" would still put the job in
    # Tableau's candidate pool.
    verdicts, _ = _judge("1|required|4\n2|absent|0")
    rows = skill_judgment.to_skill_rows(verdicts)

    assert [r.taxonomy_key for r in rows] == ["Python (Programming Language)"]
    assert rows[0].zone == "must_have"


def test_a_garbled_reply_yields_fewer_verdicts_not_wrong_ones() -> None:
    verdicts, _ = _judge("1|required|4\nsorry, I cannot\n\n||\n3|maybe|2")

    assert [v.taxonomy_key for v in verdicts] == ["Python (Programming Language)"]


def test_a_missing_level_defaults_to_hands_on_rather_than_failing() -> None:
    verdicts, _ = _judge("1|required|\n2|preferred|x")

    assert [v.required_level for v in verdicts] == [2, 2]


def test_the_token_budget_scales_with_the_candidate_count() -> None:
    # The path this replaces sets a flat 512 (2048 for a reasoning model) and
    # hopes — which is how a ~120-token answer costs a minute of generation.
    _, provider = _judge("1|required|4")

    assert provider.max_tokens == skill_judgment.budget_tokens(len(CANDIDATES))
    assert skill_judgment.budget_tokens(3) < skill_judgment.budget_tokens(30) < 512


def test_a_provider_failure_leaves_the_floor_standing() -> None:
    # Stage A's rows are already persisted. A failed judgment must never leave
    # a job worse off than deterministic extraction did.
    class _Boom:
        async def complete(self, *a, **k):
            raise RuntimeError("model down")

    verdicts = asyncio.run(
        skill_judgment.judge_skills("Data Engineer", "JD", CANDIDATES, provider=_Boom())
    )

    assert verdicts == []
    assert skill_judgment.to_skill_rows(verdicts) == []


def test_no_candidates_means_no_model_call() -> None:
    provider = _Provider("1|required|4")
    verdicts = asyncio.run(
        skill_judgment.judge_skills("Role", "JD", [], provider=provider)
    )

    assert verdicts == []
    assert provider.calls == 0
