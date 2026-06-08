"""Unit tests for the per-bullet rewrite no-fabrication guard (cv_rewrite).

Pure logic only — no LLM. The provider path is exercised via suggest_rewrite
returning the no-fab question (provider not called) and the error branch.
"""
import asyncio

from app.services import cv_rewrite


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
