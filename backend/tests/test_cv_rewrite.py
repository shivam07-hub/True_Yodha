"""Unit tests for the per-bullet rewrite no-fabrication guard (cv_rewrite).

Logic + the #32 grounding path. The LLM provider and the Mentor retriever are
faked — no network, no real model.
"""
import asyncio
from dataclasses import dataclass

from app.services import cv_rewrite


@dataclass
class _Passage:
    chunk_text: str
    source_title: str
    source_id: str = "myro-cv-playbook-v1"
    source_url: str | None = None
    similarity: float = 0.9


class _FakeProvider:
    def __init__(self, text="Led a team of 12 to cut churn 18% by shipping a retention flow"):
        self._text = text
        self.last_messages = None

    async def complete(self, messages, max_tokens=0, temperature=None):
        self.last_messages = messages
        return self._text


def _patch_retrieve(monkeypatch, passages):
    async def fake_retrieve(query, shelf="cv", k=3):
        return passages

    monkeypatch.setattr(cv_rewrite.mentor_retriever, "retrieve", fake_retrieve)


def test_has_metric_detects_numbers_and_magnitudes():
    assert cv_rewrite.has_metric("Cut churn 18% in two quarters")
    assert cv_rewrite.has_metric("Saved ₹4 lakh annually")
    assert cv_rewrite.has_metric("Grew users to 40k")
    assert cv_rewrite.has_metric("Shipped over 3 months")
    assert cv_rewrite.has_metric("Led a team of 12")


def test_has_metric_false_for_vague_bullets():
    assert not cv_rewrite.has_metric("Worked with engineering on delivery")
    assert not cv_rewrite.has_metric("Responsible for the product roadmap")
    assert not cv_rewrite.has_metric("")


def test_should_ask_for_metric_guard():
    # No metric, no user-supplied number → ask.
    assert cv_rewrite.should_ask_for_metric("Owned the roadmap", None) is True
    # User supplied a metric → don't ask.
    assert cv_rewrite.should_ask_for_metric("Owned the roadmap", "activation 22%→31%") is False
    # Bullet already has a metric → don't ask.
    assert cv_rewrite.should_ask_for_metric("Cut churn 18%", None) is False


def test_build_messages_includes_role_metric_and_keywords():
    msgs = cv_rewrite._build_messages(
        "Owned the roadmap",
        role="Senior PM",
        missing_keywords=["A/B testing", "SQL"],
        metric="shipped 9 releases",
    )
    user = msgs[-1]["content"]
    assert "Senior PM" in user
    assert "shipped 9 releases" in user
    assert "A/B testing" in user
    assert "no-fabrication" in msgs[0]["content"].lower() or "never invent" in msgs[0]["content"].lower()


def test_suggest_rewrite_returns_question_when_no_metric():
    out = asyncio.run(cv_rewrite.suggest_rewrite("Owned the roadmap", None, [], None, provider=None))
    assert out["mode"] == "question"
    assert "metric" not in out  # only a question is returned
    assert out["question"]


def test_suggest_rewrite_errors_without_provider_when_metric_present():
    # Has a metric → no-fab guard passes → provider needed; None → graceful error.
    out = asyncio.run(cv_rewrite.suggest_rewrite("Cut churn 18%", None, [], None, provider=None))
    assert out["mode"] == "error"


def test_suggest_rewrite_empty_bullet_is_error():
    out = asyncio.run(cv_rewrite.suggest_rewrite("   ", None, [], None, provider=None))
    assert out["mode"] == "error"


# ── #32 grounding ──────────────────────────────────────────────────────────────

def test_build_messages_injects_retrieved_passages():
    passages = [_Passage("Start every bullet with a strong action verb.", "Myro CV Playbook v1")]
    sys_grounded = cv_rewrite._build_messages("Cut churn 18%", None, [], None, passages)[0]["content"]
    assert "strong action verb" in sys_grounded
    assert "Myro CV Playbook v1" in sys_grounded
    # No passages → static XYZ guidance instead.
    sys_static = cv_rewrite._build_messages("Cut churn 18%", None, [], None, None)[0]["content"]
    assert "XYZ" in sys_static
    assert "strong action verb" not in sys_static


def test_grounded_rewrite_surfaces_citations(monkeypatch):
    provider = _FakeProvider()
    _patch_retrieve(monkeypatch, [
        _Passage("Quantify impact, and never invent the number.", "Myro CV Playbook v1"),
        _Passage("Tailor the bullet to the target job description.", "Myro CV Playbook v1"),
    ])
    out = asyncio.run(cv_rewrite.suggest_rewrite("Cut churn 18%", "Senior PM", [], None, provider))
    assert out["mode"] == "rewrite"
    assert out["citations"] == ["Myro CV Playbook v1"]          # de-duped, separate from rationale
    # the retrieved rule reached the system prompt
    assert "never invent the number" in provider.last_messages[0]["content"]


def test_rewrite_failsoft_when_retrieval_empty(monkeypatch):
    provider = _FakeProvider()
    _patch_retrieve(monkeypatch, [])      # RAG down / empty corpus
    out = asyncio.run(cv_rewrite.suggest_rewrite("Cut churn 18%", None, [], None, provider))
    assert out["mode"] == "rewrite"        # still succeeds
    assert out["citations"] == []
    assert "XYZ" in provider.last_messages[0]["content"]   # fell back to static guidance
