"""Unit tests for mentor_grounding — the one seam Mentor writes from.

Covers the reservoir-first candidate-number extraction (the trust-critical Q5 path)
and the prompt-block assembly. Retrieval + recall are faked — no network.
"""
import asyncio

from app.services import mentor_grounding
from app.services.memory_recall import StoryHit
from app.services.mentor_retriever import PlaybookPassage


def _story(sid: str, title: str, result: str, skills=None) -> StoryHit:
    return StoryHit(id=sid, title=title, pointer="", result=result, skills=skills or [], similarity=0.9)


def test_metrics_from_stories_pulls_verbatim_numbers():
    stories = [
        _story("s1", "Sales bots", "cut proposal turnaround 40% for the sales team"),
        _story("s2", "Growth", "grew ARR to ₹2Cr in 18 months"),
    ]
    cands = mentor_grounding._metrics_from_stories(stories)
    values = [c.value for c in cands]
    assert "40%" in values
    assert any("2" in v for v in values)          # ₹2Cr captured
    # provenance is carried, first story first
    assert cands[0].story_title == "Sales bots"
    assert cands[0].story_id == "s1"


def test_metrics_ignores_lone_single_digits():
    # A bare "3" with no unit is noise, not a metric — must not be offered.
    cands = mentor_grounding._metrics_from_stories([_story("s1", "Team", "worked with 3 people on a thing")])
    # "3 people" has a unit-less lone digit → dropped; nothing offered.
    assert all(c.value.strip() != "3" for c in cands)


def test_metrics_empty_when_no_result_text():
    assert mentor_grounding._metrics_from_stories([_story("s1", "Vague", "")]) == []


def test_prompt_block_combines_playbook_and_stories():
    g = mentor_grounding.MentorGrounding(
        passages=[PlaybookPassage("Lead with the result.", "pb1", "Myro CV Playbook", None, 0.9)],
        stories=[_story("s1", "Sales bots", "cut turnaround 40%")],
    )
    block = g.prompt_block()
    assert "Lead with the result." in block
    assert "STAR" in block or "XYZ" in block or "playbook" in block.lower()
    assert "Sales bots" in block
    # candidate metrics drive the user-facing provenance prompt, NOT the model prompt
    assert g.candidate_metrics == [] or "candidate" not in block.lower()


def test_prompt_block_empty_when_nothing_grounds():
    assert mentor_grounding.MentorGrounding().prompt_block() == ""
    assert mentor_grounding.MentorGrounding().has_grounding() is False


def test_assemble_skips_stories_for_anon(monkeypatch):
    async def fake_retrieve(query, shelf="cv", k=3):
        return [PlaybookPassage("rule", "pb1", "Myro CV Playbook", None, 0.9)]

    called = {"recall": False}

    async def fake_recall(user_id, query, k=3):
        called["recall"] = True
        return []

    monkeypatch.setattr(mentor_grounding.mentor_retriever, "retrieve", fake_retrieve)
    monkeypatch.setattr(mentor_grounding.memory_recall, "recall_stories", fake_recall)

    g = asyncio.run(mentor_grounding.assemble("some bullet", user_id=None))
    assert g.passages and not g.stories
    assert called["recall"] is False           # anon → no reservoir lookup at all
