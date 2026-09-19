"""jd_brief — the JD understood once, boilerplate removed.

Truncating a JD cuts by POSITION, and a job post keeps its non-negotiables at
the bottom. A real 7,404-char post (Provakil GTM, 2026-09) lost its entire
Good-to-have block to the 6,000-char weave cap — the named target geographies,
the years of SaaS, the CRM — while three paragraphs of aspiration survived.
`jd_coverage` did not rescue it either: it caps at 14 requirements and orders
responsibilities first, so the must-haves never made the list.
"""
from __future__ import annotations

import asyncio

from app.services import cv_weave, jd_brief
from app.services.jd_coverage import CoverageItem


def _run(coro):
    return asyncio.run(coro)


class _Provider:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.seen: list[str] = []

    async def complete(self, messages, **kw):
        self.seen.append(messages[-1]["content"])
        return self.reply


GOOD = (
    '{"locations": ["India", "MENA", "Southeast Asia"], '
    '"seniority": "5+ years", '
    '"must_haves": ["5+ years GTM strategy in a SaaS company"], '
    '"nice_to_haves": ["MBA from a premier institution", "Salesforce or HubSpot"]}'
)


def test_a_brief_keeps_the_markets_a_truncated_jd_would_have_dropped():
    brief = _run(jd_brief.assess("... long JD ...", _Provider(GOOD)))
    assert brief is not None
    assert "Southeast Asia" in brief.locations
    assert brief.nice_to_haves[0].startswith("MBA")


def test_the_digest_names_the_markets_and_labels_each_ask():
    brief = _run(jd_brief.assess("jd", _Provider(GOOD)))
    text = jd_brief.digest(brief)
    assert "MENA" in text and "Southeast Asia" in text
    assert "[Must have] 5+ years GTM strategy in a SaaS company" in text
    assert "[Nice to have] MBA from a premier institution" in text


def test_an_empty_or_malformed_brief_is_no_brief_at_all():
    assert jd_brief.parse_brief_response("not json") is None
    assert jd_brief.parse_brief_response('{"locations": [], "seniority": ""}') is None
    assert jd_brief.from_payload(None) is None
    assert jd_brief.digest(None) == "", "no brief means no section, not an empty heading"


def test_the_brief_round_trips_through_its_cache_payload():
    brief = _run(jd_brief.assess("jd", _Provider(GOOD)))
    back = jd_brief.from_payload(jd_brief.to_payload(brief))
    assert back is not None
    assert back.locations == brief.locations
    assert back.must_haves == brief.must_haves


def test_provider_failure_is_no_brief_not_an_exception():
    class _Dead:
        async def complete(self, messages, **kw):
            from app.services.llm_provider import LLMProviderError
            raise LLMProviderError("all providers down")

    assert _run(jd_brief.assess("jd", _Dead())) is None


def test_the_weave_prompt_carries_the_brief_and_still_carries_the_prose():
    """The brief holds the FACTS; the raw JD holds the job's own LANGUAGE, and
    mirroring that language honestly is the weave's task. Both, or the weave
    starts writing in a vocabulary the posting never used."""
    brief = _run(jd_brief.assess("jd", _Provider(GOOD)))
    blocks = [{"index": 0, "role": "BDM", "company": "Capgemini", "dates": "", "bullets": ["Sold cloud."]}]
    items = [CoverageItem(requirement="Own GTM for international markets", status="gap")]
    messages = cv_weave._build_messages(
        "GTM Manager", "Provakil", "RAW JD PROSE HERE",
        items, blocks, [], [], brief,
    )
    prompt = messages[-1]["content"]
    assert "Southeast Asia" in prompt, "the market the truncation used to eat"
    assert "RAW JD PROSE HERE" in prompt
    assert prompt.index("screens on") < prompt.index("RAW JD PROSE HERE"), (
        "the understood JD leads; the prose that gets truncated follows"
    )


def test_without_a_brief_the_prompt_is_exactly_what_it_was_before():
    blocks = [{"index": 0, "role": "BDM", "company": "X", "dates": "", "bullets": ["Line."]}]
    prompt = cv_weave._build_messages(
        "T", "C", "PROSE", [CoverageItem(requirement="r", status="gap")], blocks, [], [], None,
    )[-1]["content"]
    assert "screens on" not in prompt
    assert "PROSE" in prompt
