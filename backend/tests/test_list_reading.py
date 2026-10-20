"""List Reading's triage round (ADR-0027).

The triage decides which jobs of a round get the full career-ops evaluation, so
it must judge the same person the evaluation judges, and nothing about skill
overlap may steer it.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from app.services import llm_ranker
from app.services.llm_provider import LLMProviderError
from app.services.matching import list_reading

PROFILE = {
    "target_roles": ["Partner Solution Sales"],
    "target_locations": ["Bangalore"],
    "target_location": "Bangalore",
    "career_goal": "Lead a cloud partner business in India",
    "superpower": "Turning partner pipelines into closed revenue",
    "deal_breakers": ["No pure cold-calling roles", "Below 30 LPA"],
    "known_facts": ["Prefers hybrid work"],
    "cv_markdown": "Sales lead at Capgemini. Built a partner pipeline of 20 accounts.",
}


def _job(n: int, **extra) -> dict:
    return {
        "job_id": f"j{n}",
        "title": f"Role {n}",
        "company": f"Company {n}",
        "location": "Bangalore",
        "description": f"Own partner revenue for region {n}.",
        "overlap_score": 87,
        "matched_skills": ["SQL", "Salesforce"],
        **extra,
    }


class _Provider:
    def __init__(self, raw: str | Exception) -> None:
        self._raw = raw
        self.messages: list[list[dict]] = []

    async def complete(self, messages, max_tokens=None, temperature=None):
        self.messages.append(messages)
        if isinstance(self._raw, Exception):
            raise self._raw
        return self._raw


def _round(jobs, raw, **kw):
    provider = _Provider(raw)
    kept = asyncio.run(list_reading.triage_round(PROFILE, jobs, provider, **kw))
    return kept, provider


def test_triage_judges_the_same_person_the_evaluation_judges() -> None:
    brief = llm_ranker.candidate_brief(PROFILE, PROFILE["cv_markdown"])
    assert brief in llm_ranker.build_system_prompt(PROFILE, PROFILE["cv_markdown"])
    assert brief in list_reading.triage_system_prompt(PROFILE)
    # The parts of the brief the old triage never saw.
    for told in ("Prefers hybrid work", "No pure cold-calling roles", "Lead a cloud partner business"):
        assert told in list_reading.triage_system_prompt(PROFILE)


def test_triage_never_sees_overlap_or_matched_skills() -> None:
    message = list_reading.triage_user_message([_job(1), _job(2)], keep_n=1)
    assert "overlap" not in message.lower()
    assert "matched" not in message.lower()
    assert "87" not in message
    assert "Salesforce" not in message


def test_a_round_keeps_what_triage_kept_in_its_order() -> None:
    kept, provider = _round([_job(1), _job(2), _job(3)], json.dumps({"shortlist": [3, 1]}))
    assert kept == ["j3", "j1"]
    assert len(provider.messages) == 1


def test_an_empty_shortlist_keeps_nothing() -> None:
    kept, _ = _round([_job(1), _job(2)], json.dumps({"shortlist": []}))
    assert kept == []


def test_a_round_never_keeps_more_than_its_cap() -> None:
    kept, _ = _round([_job(n) for n in range(1, 6)], json.dumps({"shortlist": [1, 2, 3, 4, 5]}), keep_n=2)
    assert kept == ["j1", "j2"]


@pytest.mark.parametrize("raw", [LLMProviderError("down"), "not json at all"])
def test_a_round_the_judge_did_not_read_is_none_not_a_guess(raw) -> None:
    """The old triage fell back to the overlap head. A round nobody read stays
    unread, so the next pass reads it; overlap never stands in for the judge."""
    kept, _ = _round([_job(1), _job(2)], raw)
    assert kept is None


def test_a_round_is_at_most_fifty_jobs() -> None:
    with pytest.raises(ValueError):
        _round([_job(n) for n in range(list_reading.ROUND_SIZE + 1)], json.dumps({"shortlist": []}))


def test_an_empty_round_costs_no_call() -> None:
    kept, provider = _round([], json.dumps({"shortlist": [1]}))
    assert kept == [] and provider.messages == []
